using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Http;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

[assembly: AssemblyTitle("beepoptvc 连接更新")]
[assembly: AssemblyVersion("0.6.1.0")]
namespace BeePopNetworkUpdate {
 internal sealed class UpdateCore : IDisposable {
  public readonly string Root,Engine; public readonly int Port; public Action<string> Progress;
  readonly JavaScriptSerializer json=new JavaScriptSerializer(); readonly HttpClient http=new HttpClient(new HttpClientHandler{UseProxy=false}){Timeout=TimeSpan.FromSeconds(4)};
  const string OldRelay="b48ffe102de7edef078de4c87a1b548d7ff1c8cd26d53392c9232f0e87d88085",ServiceHash="76c324e33bfc39539700608af003396be7350897666d368aa99c05b3b9cc4d39";
  public UpdateCore(string root,int port){Root=Path.GetFullPath(root);Engine=Path.Combine(Root,"assistant");Port=port;}
  public static string Sha(byte[] bytes){using(SHA256 h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
  public static byte[] Resource(string name){using(Stream input=Assembly.GetExecutingAssembly().GetManifestResourceStream(name)){if(input==null)throw new Exception("更新文件缺失："+name);using(MemoryStream output=new MemoryStream()){input.CopyTo(output);return output.ToArray();}}}
  public string Node { get {return Path.Combine(Engine,"data","runtime","node-v24.19.0-win-x64","node.exe");}}
  void Report(string message){if(Progress!=null)Progress(message);}
  public void Validate(){if(!File.Exists(Node)||!File.Exists(Path.Combine(Engine,"relay.cjs")))throw new Exception("未找到 App 版助手。请先打开已安装的 beepoptvc 助手，再运行此更新。");if(Sha(File.ReadAllBytes(Path.Combine(Engine,"windows-service.cjs")))!=ServiceHash)throw new Exception("当前助手启动文件版本不匹配，更新未修改文件。");string old=Sha(File.ReadAllBytes(Path.Combine(Engine,"relay.cjs")));if(old!=OldRelay&&old!=Sha(Resource("relay.cjs")))throw new Exception("检测到其他版本的连接模块，更新未覆盖该文件。");}
  public async Task<Dictionary<string,object>> Health(){try{using(HttpResponseMessage response=await http.GetAsync("http://127.0.0.1:"+Port+"/health").ConfigureAwait(false)){var d=json.Deserialize<Dictionary<string,object>>(await response.Content.ReadAsStringAsync().ConfigureAwait(false));if(Text(d,"service")!="beepoptvc-local")throw new Exception("本机端口被其他程序占用。");return d;}}catch(HttpRequestException){return null;}catch(TaskCanceledException){return null;}}
  static string Text(Dictionary<string,object> d,string key){object v;return d.TryGetValue(key,out v)&&v!=null?Convert.ToString(v):"";}
  public async Task Stop(){var state=await Health().ConfigureAwait(false);if(state==null)return;string file=Path.Combine(Engine,"data","service-control.json");if(!File.Exists(file))throw new Exception("当前助手由其他文件夹启动，请先从原助手退出，再运行更新。");var data=json.Deserialize<Dictionary<string,object>>(File.ReadAllText(file));string secret=Text(data,"secret");if(Text(data,"port")!=Port.ToString()||!System.Text.RegularExpressions.Regex.IsMatch(secret,"^[a-f0-9]{64}$"))throw new Exception("助手控制信息不匹配，更新未停止任何程序。");using(var request=new HttpRequestMessage(HttpMethod.Post,"http://127.0.0.1:"+Port+"/service/stop")){request.Headers.Add("X-BeePOP-Service",secret);using(var response=await http.SendAsync(request).ConfigureAwait(false)){if(!response.IsSuccessStatusCode)throw new Exception("助手仍有任务或正在准备，请完成后再更新。");}}
   for(int i=0;i<40;i++){if(await Health().ConfigureAwait(false)==null)return;await Task.Delay(200).ConfigureAwait(false);}throw new Exception("助手尚未结束，更新未写入文件。");
  }
  public Task<string> RunNode(string arguments){return Task.Run(delegate{var info=new ProcessStartInfo(Node,arguments){WorkingDirectory=Engine,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8,StandardErrorEncoding=Encoding.UTF8};info.EnvironmentVariables["BEEPOP_PORT"]=Port.ToString();info.EnvironmentVariables["BEEPOP_NO_OPEN"]="1";info.EnvironmentVariables["PATH"]=Path.GetDirectoryName(Node)+";"+Environment.GetEnvironmentVariable("PATH");using(Process p=new Process{StartInfo=info}){StringBuilder output=new StringBuilder(),error=new StringBuilder();p.OutputDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)output.AppendLine(e.Data);};p.ErrorDataReceived+=delegate(object sender,DataReceivedEventArgs e){if(e.Data!=null)error.AppendLine(e.Data);};p.Start();p.BeginOutputReadLine();p.BeginErrorReadLine();if(!p.WaitForExit(30000)){try{p.Kill();}catch{}throw new Exception("连接检查超时。请检查 Windows 当前网络。");}p.WaitForExit();if(p.ExitCode!=0)throw new Exception(output.Length>0?output.ToString().Trim():"助手启动未完成，请查看原助手日志。");return output.ToString().Trim();}});}
  public async Task<string> Check(){Validate();string tool=Path.Combine(Root,"network-check-0.6.1.cjs");File.WriteAllBytes(tool,Resource("relay-network.cjs"));return await RunNode("\""+tool+"\" check").ConfigureAwait(false);}
  public async Task Apply(){Validate();Report("正在安全结束旧的连接服务…");await Stop().ConfigureAwait(false);Report("正在更新网络兼容模块，保留模型、素材和账号…");
   await Task.Run(delegate{foreach(string name in new[]{"relay-network.cjs","relay.cjs"}){string target=Path.Combine(Engine,name),backup=target+".before-network-update";byte[] bytes=Resource(name);if(File.Exists(target)&&Sha(File.ReadAllBytes(target))==Sha(bytes))continue;if(File.Exists(target)&&!File.Exists(backup))File.Copy(target,backup);string temp=target+".network-update";File.WriteAllBytes(temp,bytes);if(Sha(File.ReadAllBytes(temp))!=Sha(bytes))throw new Exception("更新文件校验失败。");if(File.Exists(target))File.Replace(temp,target,null);else File.Move(temp,target);}File.WriteAllText(Path.Combine(Engine,"data","network-update.json"),json.Serialize(new{version="0.6.1",relaySha256=Sha(Resource("relay.cjs")),networkSha256=Sha(Resource("relay-network.cjs")),updatedAt=DateTime.UtcNow.ToString("o")}),Encoding.UTF8);}).ConfigureAwait(false);
   Report("正在重新启动助手…");await RunNode("\""+Path.Combine(Engine,"windows-service.cjs")+"\" start").ConfigureAwait(false);for(int i=0;i<60;i++){var health=await Health().ConfigureAwait(false);if(health!=null){if(Text(health,"failed")=="True")throw new Exception(Text(health,"message"));if(Text(health,"ready")=="True")return;}await Task.Delay(500).ConfigureAwait(false);}throw new Exception("更新已安装，助手仍在准备；请查看原助手状态页。");
  }
  public void Dispose(){http.Dispose();}
 }
 internal sealed class UpdateForm:Form {
  readonly UpdateCore core;readonly Label title=new Label(),message=new Label();readonly TextBox details=new TextBox();readonly Button repair=new Button(),check=new Button();bool busy;
  public UpdateForm(UpdateCore c){core=c;Text="beepoptvc · 连接更新 0.6.1";ClientSize=new Size(680,430);MinimumSize=Size;StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",10);BackColor=Color.FromArgb(247,248,242);
   title.SetBounds(28,25,620,50);title.Font=new Font(Font.FontFamily,23,FontStyle.Bold);title.Text="修复助手与官网的连接";Controls.Add(title);
   message.SetBounds(30,90,620,65);message.Text="沿用本机已配置的系统代理，并显示具体网络错误。\n此更新保留配音模型、产品素材和现有账号。";Controls.Add(message);
   repair.SetBounds(30,170,200,44);repair.Text="更新并重启连接服务";repair.BackColor=Color.FromArgb(217,255,113);repair.FlatStyle=FlatStyle.Flat;Controls.Add(repair);
   check.SetBounds(245,170,160,44);check.Text="仅检查后台网络";check.FlatStyle=FlatStyle.Flat;Controls.Add(check);
   Button site=new Button{Text="返回官网 ↗",FlatStyle=FlatStyle.Flat};site.SetBounds(420,170,150,44);Controls.Add(site);
   Button copy=new Button{Text="复制结果",FlatStyle=FlatStyle.Flat};copy.SetBounds(580,170,70,44);copy.Click+=delegate{if(details.Text.Length>0)Clipboard.SetText(details.Text);};Controls.Add(copy);
   details.SetBounds(30,235,620,140);details.Multiline=true;details.ReadOnly=true;details.ScrollBars=ScrollBars.Vertical;details.BackColor=Color.White;Controls.Add(details);
   Label note=new Label{Text="不会提交授权或生成任务，不更改 Windows 代理和防火墙设置。",ForeColor=Color.DimGray};note.SetBounds(30,390,620,25);Controls.Add(note);
   core.Progress=delegate(string text){if(IsHandleCreated&&!IsDisposed)BeginInvoke((Action)delegate{message.Text=text;});};
   repair.Click+=async delegate{if(busy)return;SetBusy(true);try{await core.Apply();message.Text="连接模块已更新。请返回官网重新发起授权。";await Probe();}catch(Exception e){message.Text="更新未完成";details.Text=e.Message;}finally{SetBusy(false);}};
   check.Click+=async delegate{if(busy)return;SetBusy(true);await Probe();SetBusy(false);};site.Click+=delegate{Process.Start(new ProcessStartInfo("https://fenglingai-max.github.io/beepop-video-studio/?v=20261026-network1#create"){UseShellExecute=true});};
  }
  void SetBusy(bool value){busy=value;repair.Enabled=!value;check.Enabled=!value;}
  async Task Probe(){try{string result=await core.Check();var d=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(result);details.Text="后台网络检查通过。\r\n连接方式："+Convert.ToString(d["label"])+"\r\n未提交授权或生成任务。";}catch(Exception e){details.Text=e.Message;}}
  public void Preview(string path){message.Text="连接模块已更新。请返回官网重新发起授权。";details.Text="后台网络检查通过。\r\n连接方式：Windows 系统代理\r\n未提交授权或生成任务。";Show();Application.DoEvents();using(Bitmap bitmap=new Bitmap(Width,Height)){DrawToBitmap(bitmap,new Rectangle(Point.Empty,Size));bitmap.Save(path);}}
 }
 internal static class Program {
  [STAThread]static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);if(args.Length==2&&args[0]=="--self-test")return SelfTest(args[1]);string root=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"beepoptvc");using(UpdateCore core=new UpdateCore(root,47831))using(UpdateForm form=new UpdateForm(core))Application.Run(form);return 0;}
  static int SelfTest(string root){try{using(UpdateCore core=new UpdateCore(root,47845)){
   Task.Run(async delegate{
    string marker=Path.Combine(core.Engine,"data","fixture-active");File.WriteAllText(marker,"active");bool blocked=false;string original=UpdateCore.Sha(File.ReadAllBytes(Path.Combine(core.Engine,"relay.cjs")));try{await core.Apply();}catch{blocked=true;}if(!blocked||original!=UpdateCore.Sha(File.ReadAllBytes(Path.Combine(core.Engine,"relay.cjs"))))throw new Exception("Active task was not protected");File.Delete(marker);
    await core.Apply();await core.Apply();await core.Stop();
   }).GetAwaiter().GetResult();
   if(File.ReadAllText(Path.Combine(core.Engine,"data","fixture-private.txt"))!="PRESERVE_FIXTURE")throw new Exception("Fixture data changed");
   foreach(string name in new[]{"relay-network.cjs","relay.cjs"})if(UpdateCore.Sha(File.ReadAllBytes(Path.Combine(core.Engine,name)))!=UpdateCore.Sha(UpdateCore.Resource(name)))throw new Exception("Patch checksum mismatch");
   using(UpdateForm form=new UpdateForm(core))form.Preview(Path.Combine(root,"network-update-preview.png"));
   File.WriteAllText(Path.Combine(root,"network-update-test.json"),"{\"nativeExe\":true,\"sourceHashesVerified\":true,\"restartVerified\":true,\"idempotentUpdate\":true,\"activeTaskProtected\":true,\"fixtureDataPreserved\":true,\"codexInferenceSubmitted\":false}");
  }return 0;}catch(Exception e){File.WriteAllText(Path.Combine(root,"network-update-error.txt"),e.ToString());return 1;}}
 }
}
