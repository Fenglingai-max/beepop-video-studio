using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Http;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("beepoptvc 助手")]
[assembly: AssemblyDescription("Native Windows launcher for the user's own local TVC assistant")]
[assembly: AssemblyVersion("0.6.0.0")]
[assembly: AssemblyFileVersion("0.6.0.0")]

namespace BeePopAssistant {
    internal sealed class Snapshot {
        public bool Online, Ready, Failed;
        public string Stage = "stopped", Message = "点击启动助手，准备好后即可打开官网。", Version = "";
    }

    internal sealed class Core : IDisposable {
        public const string AppVersion = "0.6.0 完整版";
        public const string Site = "https://fenglingai-max.github.io/beepop-video-studio/?source=windows-app#create";
        public const string NodeHash = "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73";
        public readonly string Root, Engine, LogPath;
        public readonly int Port;
        readonly HttpClient http;
        readonly JavaScriptSerializer json = new JavaScriptSerializer();
        public Action<string, string> Progress;
        public string PayloadHash { get; private set; }

        public Core(string root, int port) {
            Root = Path.GetFullPath(root); Engine = Path.Combine(Root, "assistant"); Port = port;
            Directory.CreateDirectory(Root); LogPath = Path.Combine(Root, "assistant-app.log");
            http = new HttpClient(new HttpClientHandler { UseProxy = false });
            http.Timeout = TimeSpan.FromSeconds(3);
        }
        public string BaseUrl { get { return "http://127.0.0.1:" + Port; } }
        public static string Sha(Stream stream) {
            using (SHA256 hash = SHA256.Create()) return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "").ToLowerInvariant();
        }
        public static string FileSha(string file) { using (Stream s = File.OpenRead(file)) return Sha(s); }
        public static Stream Resource(string name) {
            Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(name);
            if (s == null) throw new InvalidDataException("应用内置文件缺失：" + name); return s;
        }
        public static string ResourceText(string name) { using (Stream s = Resource(name)) using (StreamReader r = new StreamReader(s, Encoding.UTF8)) return r.ReadToEnd(); }
        public void Log(string text) {
            try { File.AppendAllText(LogPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + " " + text + Environment.NewLine, Encoding.UTF8); } catch { }
        }
        public void Report(string stage, string message) { Log(message); if (Progress != null) Progress(stage, message); }
        public static string Text(IDictionary<string, object> d, string name) { object v; return d.TryGetValue(name, out v) && v != null ? Convert.ToString(v) : ""; }
        static bool Bool(IDictionary<string, object> d, string name) { object v; return d.TryGetValue(name, out v) && v is bool && (bool)v; }
        public async Task<Snapshot> HealthAsync() {
            try {
                using (HttpResponseMessage r = await http.GetAsync(BaseUrl + "/health")) {
                    if (!r.IsSuccessStatusCode) throw new InvalidOperationException("47831 端口被其他服务占用。");
                    Dictionary<string, object> d = json.Deserialize<Dictionary<string, object>>(await r.Content.ReadAsStringAsync());
                    if (Text(d, "service") != "beepoptvc-local") throw new InvalidOperationException("本机端口上运行的不是 beepoptvc 助手。");
                    string version = Text(d, "version");
                    if (!version.StartsWith("0.4.")) throw new InvalidOperationException("检测到旧助手 " + version + "。请先完成原任务并关闭旧助手窗口，再启动 App。");
                    bool ready = d.ContainsKey("ready") ? Bool(d, "ready") : true;
                    return new Snapshot { Online = true, Ready = ready, Failed = Bool(d, "failed"), Stage = Text(d, "stage"), Message = Text(d, "message"), Version = version };
                }
            } catch (HttpRequestException) { return new Snapshot(); }
              catch (TaskCanceledException) { return new Snapshot(); }
        }
        public static void ExtractSafe(Stream source, string target, string prefix, Action<int> onProgress = null) {
            string root = Path.GetFullPath(target).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
            Directory.CreateDirectory(root); long total = 0;
            using (ZipArchive zip = new ZipArchive(source, ZipArchiveMode.Read, false)) {
                if (zip.Entries.Count > 100000) throw new InvalidDataException("应用内置文件数量异常。");
                long expectedBytes = 0; foreach (ZipArchiveEntry item in zip.Entries) expectedBytes += item.Length; int percent = -1;
                foreach (ZipArchiveEntry e in zip.Entries) {
                    if (!e.FullName.StartsWith(prefix, StringComparison.Ordinal)) throw new InvalidDataException("应用内置文件路径异常。");
                    string name = e.FullName.Substring(prefix.Length);
                    if (name.Length == 0) continue;
                    string dest = Path.GetFullPath(Path.Combine(root, name.Replace('/', Path.DirectorySeparatorChar)));
                    if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("拒绝越界解压路径。");
                    total += e.Length; if (total > 3500L * 1024 * 1024) throw new InvalidDataException("解压大小超出限制。");
                    if (String.IsNullOrEmpty(e.Name) || e.FullName.EndsWith("/") || e.FullName.EndsWith("\\")) { Directory.CreateDirectory(dest); continue; }
                    Directory.CreateDirectory(Path.GetDirectoryName(dest));
                    using (Stream input = e.Open()) using (Stream output = File.Create(dest)) input.CopyTo(output);
                    int next = expectedBytes == 0 ? 100 : (int)(total * 100 / expectedBytes); if (onProgress != null && next != percent) { percent = next; onProgress(next); }
                }
            }
        }
        public async Task InstallPayloadAsync() {
            Report("unpack", "正在准备内置助手文件…");
            Dictionary<string, object> manifest = json.Deserialize<Dictionary<string, object>>(ResourceText("payload.json"));
            PayloadHash = Text(manifest, "sha256");
            await Task.Run(delegate {
                using (Stream s = Resource("helper.zip")) if (Sha(s) != PayloadHash) throw new InvalidDataException("应用内置助手校验失败，请重新下载 App。");
                string stamp = Path.Combine(Engine, "payload.sha256");
                if (File.Exists(stamp) && File.ReadAllText(stamp).Trim() == PayloadHash && File.Exists(Path.Combine(Engine, "windows-service.cjs"))) return;
                using (Stream s = Resource("helper.zip")) ExtractSafe(s, Engine, "beepoptvc-local/");
                File.WriteAllText(stamp, PayloadHash, Encoding.ASCII);
            });
        }
        public async Task InstallEnvironmentAsync(bool repair) {
            string stamp = Path.Combine(Engine, "data", "environment.sha256");
            Dictionary<string, object> meta = json.Deserialize<Dictionary<string, object>>(ResourceText("environment.json"));
            string expected = Text(meta, "sha256");
            if (!repair && File.Exists(stamp) && File.ReadAllText(stamp).Trim() == expected && File.Exists(Path.Combine(Engine, "node_modules", "kokoro-js", "package.json")) && File.Exists(Path.Combine(Engine, "data", "models", "kokoro-v1", "onnx", "model.onnx"))) return;
            if (new DriveInfo(Path.GetPathRoot(Root)).AvailableFreeSpace < 6L * 1024 * 1024 * 1024) throw new IOException("安装盘可用空间不足，请预留至少 6 GB 后再点启动 / 修复。");
            Report("verify", "1/3 正在校验内置制作组件，无需联网下载…");
            await Task.Run(delegate {
                using (Stream input = Resource("environment.zip")) if (Sha(input) != expected) throw new InvalidDataException("内置组件校验失败，请重新下载完整 App。");
                string staging = Path.Combine(Root, "environment-staging");
                Directory.CreateDirectory(staging);
                Report("unpack", "2/3 正在展开配音、渲染及 Codex 组件；首次需要写入约 2 GB 文件，请勿关闭电脑…");
                using (Stream input = Resource("environment.zip")) ExtractSafe(input, staging, "", delegate(int percent) { Report("unpack", "2/3 正在展开内置制作组件：" + percent + "%（无需联网下载）"); });
                string target = Path.Combine(Engine, "node_modules"), backup = Path.Combine(Root, "node-modules-backup");
                if (Directory.Exists(backup)) Directory.Delete(backup, true);
                if (Directory.Exists(target)) Directory.Move(target, backup);
                try { Directory.Move(Path.Combine(staging, "node_modules"), target); }
                catch { if (Directory.Exists(backup) && !Directory.Exists(target)) Directory.Move(backup, target); throw; }
                string models = Path.Combine(Engine, "data", "models", "kokoro-v1");
                string stagedModels = Path.Combine(staging, "data", "models", "kokoro-v1");
                foreach (string file in Directory.GetFiles(stagedModels, "*", SearchOption.AllDirectories)) {
                    string relative = file.Substring(stagedModels.Length + 1), dest = Path.Combine(models, relative);
                    Directory.CreateDirectory(Path.GetDirectoryName(dest)); File.Copy(file, dest, true);
                }
                File.Copy(Path.Combine(staging, "data", "dependencies.sha256"), Path.Combine(Engine, "data", "dependencies.sha256"), true);
                File.WriteAllText(stamp, expected, Encoding.ASCII);
                Directory.Delete(staging, true); if (Directory.Exists(backup)) Directory.Delete(backup, true);
            });
        }
        public async Task<string> EnsureNodeAsync() {
            string folder = Path.Combine(Engine, "data", "runtime"), node = Path.Combine(folder, "node-v24.19.0-win-x64", "node.exe");
            if (File.Exists(node)) {
                string version = await RunAsync(node, "-p \"process.versions.node+':'+process.arch\"", Engine, null);
                if (version.Trim() == "24.19.0:x64") return node;
                throw new InvalidDataException("运行环境文件异常。请通过“查看日志”联系维护者。");
            }
            Report("runtime", "正在展开 App 内置的运行环境，无需另装 Node.js…");
            await Task.Run(delegate {
                using (Stream s = Resource("node-runtime.zip")) if (Sha(s) != NodeHash) throw new InvalidDataException("内置运行环境校验失败，请重新下载 App。");
                using (Stream s = Resource("node-runtime.zip")) ExtractSafe(s, folder, "");
            });
            if ((await RunAsync(node, "-p \"process.versions.node+':'+process.arch\"", Engine, null)).Trim() != "24.19.0:x64") throw new InvalidDataException("运行环境无法正常执行。");
            return node;
        }
        public async Task<string> RunAsync(string file, string args, string cwd, IDictionary<string, string> extra) {
            return await Task.Run(delegate {
                ProcessStartInfo info = new ProcessStartInfo(file, args) { WorkingDirectory = cwd, UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true, StandardOutputEncoding = Encoding.UTF8, StandardErrorEncoding = Encoding.UTF8 };
                if (extra != null) foreach (KeyValuePair<string, string> pair in extra) info.EnvironmentVariables[pair.Key] = pair.Value;
                StringBuilder output = new StringBuilder(), error = new StringBuilder();
                using (Process p = new Process()) {
                    p.StartInfo = info;
                    p.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) { lock (output) output.AppendLine(e.Data); Log(e.Data); } };
                    p.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if (e.Data != null) { lock (error) error.AppendLine(e.Data); Log(e.Data); } };
                    p.Start(); p.BeginOutputReadLine(); p.BeginErrorReadLine();
                    if (!p.WaitForExit(45000)) { try { p.Kill(); } catch { } throw new TimeoutException("启动组件等待超时，请查看日志后重试。"); }
                    p.WaitForExit();
                    if (p.ExitCode != 0) throw new InvalidOperationException(error.Length > 0 ? error.ToString().Trim() : output.ToString().Trim());
                    return output.ToString();
                }
            });
        }
        public async Task StartAsync() {
            Snapshot existing = await HealthAsync();
            if (existing.Online && !existing.Failed) { Report(existing.Stage, existing.Ready ? "已有助手正在运行，可以打开官网。" : existing.Message); return; }
            if (existing.Online && existing.Failed) { await StopAsync(); await WaitStoppedAsync(); }
            await InstallPayloadAsync(); string node = await EnsureNodeAsync(); await InstallEnvironmentAsync(existing.Failed);
            Report("starting", "3/3 正在检查本机配音与视频渲染组件，无需下载模型…");
            Dictionary<string, string> env = new Dictionary<string, string>();
            env["BEEPOP_PORT"] = Port.ToString(); env["BEEPOP_NO_OPEN"] = "1";
            env["PATH"] = Path.GetDirectoryName(node) + ";" + Environment.GetEnvironmentVariable("PATH");
            await RunAsync(node, "\"" + Path.Combine(Engine, "windows-service.cjs") + "\" start", Engine, env);
        }
        public async Task StopAsync() {
            Snapshot state = await HealthAsync(); if (!state.Online) return;
            string file = Path.Combine(Engine, "data", "service-control.json");
            if (!File.Exists(file)) throw new InvalidOperationException("当前助手由旧文件夹启动，请先使用原窗口关闭旧助手。App 不会强制停止其他程序。");
            Dictionary<string, object> d = json.Deserialize<Dictionary<string, object>>(File.ReadAllText(file)); string secret = Text(d, "secret");
            if (Text(d, "port") != Port.ToString() || !System.Text.RegularExpressions.Regex.IsMatch(secret, "^[a-f0-9]{64}$")) throw new InvalidDataException("本机服务控制文件无效。");
            using (HttpRequestMessage q = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "/service/stop")) {
                q.Headers.Add("X-BeePOP-Service", secret);
                using (HttpResponseMessage r = await http.SendAsync(q)) {
                    if (!r.IsSuccessStatusCode) { Dictionary<string, object> error = json.Deserialize<Dictionary<string, object>>(await r.Content.ReadAsStringAsync()); throw new InvalidOperationException(Text(error, "error")); }
                }
            }
        }
        public async Task WaitStoppedAsync() { for (int i = 0; i < 30; i++) { if (!(await HealthAsync()).Online) return; await Task.Delay(200); } throw new TimeoutException("助手仍在结束任务，请稍候。"); }
        public string DiagnosticText(Snapshot state) {
            string text = "beepoptvc App " + AppVersion + Environment.NewLine + "Windows " + Environment.OSVersion.VersionString + Environment.NewLine + "服务版本：" + state.Version + Environment.NewLine + "状态：" + state.Message + Environment.NewLine;
            foreach (string file in new string[] { LogPath, Path.Combine(Engine, "data", "service-error.log"), Path.Combine(Engine, "data", "service-output.log") }) {
                try { string content = File.ReadAllText(file); text += Environment.NewLine + Path.GetFileName(file) + Environment.NewLine + content.Substring(Math.Max(0, content.Length - 5000)); } catch { }
            }
            return text;
        }
        public void Dispose() { http.Dispose(); }
    }

    internal sealed class MainForm : Form {
        public const string WindowTitle = "beepoptvc 助手";
        public readonly Button StartButton = new Button(), OpenButton = new Button(), StopButton = new Button();
        readonly Label title = new Label(), stateTitle = new Label(), stateMessage = new Label(), help = new Label();
        readonly TextBox log = new TextBox(); readonly ProgressBar progress = new ProgressBar();
        readonly CheckBox autorun = new CheckBox(); readonly NotifyIcon tray = new NotifyIcon();
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        readonly Core core; readonly bool autoStart; bool busy, polling, exiting, forTest; Snapshot snapshot = new Snapshot();
        public MainForm(Core engine, bool startOnShown) {
            core = engine; autoStart = startOnShown; forTest = !startOnShown;
            Text = WindowTitle; ClientSize = new Size(760, 550); MinimumSize = new Size(720, 560); StartPosition = FormStartPosition.CenterScreen;
            AutoScaleMode = AutoScaleMode.Dpi; Font = new Font("Microsoft YaHei UI", 9F); BackColor = Color.FromArgb(247, 248, 242);
            using (Stream s = Core.Resource("app.ico")) Icon = new Icon(s);
            TableLayoutPanel layout = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(26), RowCount = 6, ColumnCount = 1 };
            layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 58)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 125)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 53)); layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 40)); layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 36)); Controls.Add(layout);
            title.Text = "beepoptvc 助手 · 完整版"; title.Font = new Font(Font.FontFamily, 22F, FontStyle.Bold); title.Dock = DockStyle.Fill; layout.Controls.Add(title, 0, 0);
            TableLayoutPanel card = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(14), RowCount = 3, BackColor = Color.FromArgb(237, 247, 213) };
            card.RowStyles.Add(new RowStyle(SizeType.Absolute, 32)); card.RowStyles.Add(new RowStyle(SizeType.Percent, 100)); card.RowStyles.Add(new RowStyle(SizeType.Absolute, 8));
            stateTitle.Font = new Font(Font.FontFamily, 14F, FontStyle.Bold); stateTitle.Dock = DockStyle.Fill; card.Controls.Add(stateTitle, 0, 0);
            stateMessage.Dock = DockStyle.Fill; stateMessage.AutoEllipsis = true; card.Controls.Add(stateMessage, 0, 1);
            progress.Dock = DockStyle.Fill; progress.Style = ProgressBarStyle.Continuous; card.Controls.Add(progress, 0, 2); layout.Controls.Add(card, 0, 1);
            FlowLayoutPanel buttons = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(0, 10, 0, 0), WrapContents = false };
            ConfigureButton(StartButton, "启动 / 修复", Color.White); ConfigureButton(OpenButton, "打开官网 ↗", Color.FromArgb(217, 255, 113)); ConfigureButton(StopButton, "停止助手", Color.White);
            Button logs = new Button(); ConfigureButton(logs, "查看日志", Color.White); buttons.Controls.AddRange(new Control[] { StartButton, OpenButton, StopButton, logs }); layout.Controls.Add(buttons, 0, 2);
            log.Dock = DockStyle.Fill; log.Multiline = true; log.ReadOnly = true; log.ScrollBars = ScrollBars.Vertical; log.BackColor = Color.White; log.BorderStyle = BorderStyle.FixedSingle; layout.Controls.Add(log, 0, 3);
            FlowLayoutPanel options = new FlowLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(0, 8, 0, 0) };
            autorun.Text = "登录 Windows 后自动启动"; autorun.AutoSize = true;
            if (!forTest) { using (RegistryKey k = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")) autorun.Checked = k != null && k.GetValue("beepoptvcAssistant") != null; }
            Button copy = new Button { Text = "复制诊断信息", AutoSize = true, FlatStyle = FlatStyle.Flat }; options.Controls.Add(autorun); options.Controls.Add(copy); layout.Controls.Add(options, 0, 4);
            help.Dock = DockStyle.Fill; help.ForeColor = Color.DimGray; help.Text = "配音模型和渲染组件已内置；登录与生成时需要联网。只有生成视频才使用 Codex 额度。"; layout.Controls.Add(help, 0, 5);
            core.Progress = delegate(string stage, string message) { if (!IsDisposed && IsHandleCreated) BeginInvoke((Action)delegate { ShowProgress(stage, message); }); };
            StartButton.Click += async delegate { await StartNow(); };
            OpenButton.Click += delegate { try { Process.Start(new ProcessStartInfo(Core.Site) { UseShellExecute = true }); } catch (Exception e) { ShowError(e); } };
            StopButton.Click += async delegate { try { await core.StopAsync(); await core.WaitStoppedAsync(); ApplyHealth(new Snapshot()); } catch (Exception e) { ShowError(e); } };
            logs.Click += delegate { try { if (!File.Exists(core.LogPath)) File.WriteAllText(core.LogPath, "beepoptvc 应用日志\r\n", Encoding.UTF8); File.WriteAllText(Path.Combine(core.Root, "diagnostic.txt"), core.DiagnosticText(snapshot), Encoding.UTF8); Process.Start(new ProcessStartInfo("notepad.exe", "\"" + Path.Combine(core.Root, "diagnostic.txt") + "\"") { UseShellExecute = false }); } catch (Exception e) { ShowError(e); } };
            copy.Click += delegate { try { Clipboard.SetText(core.DiagnosticText(snapshot)); MessageBox.Show(this, "诊断信息已复制，不包含 OpenAI 登录凭据。", Text); } catch (Exception e) { ShowError(e); } };
            autorun.CheckedChanged += delegate { if (forTest) return; try { using (RegistryKey k = Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")) { if (autorun.Checked) k.SetValue("beepoptvcAssistant", "\"" + Program.InstalledExe + "\" --background"); else k.DeleteValue("beepoptvcAssistant", false); } } catch (Exception e) { ShowError(e); } };
            ContextMenuStrip menu = new ContextMenuStrip(); menu.Items.Add("打开助手", null, delegate { Show(); WindowState = FormWindowState.Normal; Activate(); });
            menu.Items.Add("退出窗口（后台继续运行）", null, delegate { exiting = true; Close(); });
            menu.Items.Add("停止助手并退出", null, async delegate { try { await core.StopAsync(); await core.WaitStoppedAsync(); exiting = true; Close(); } catch (Exception e) { ShowError(e); } });
            tray.Icon = Icon; tray.Text = WindowTitle; tray.ContextMenuStrip = menu; tray.Visible = !forTest; tray.DoubleClick += delegate { Show(); WindowState = FormWindowState.Normal; Activate(); };
            FormClosing += delegate(object sender, FormClosingEventArgs e) { if (!forTest && !exiting && e.CloseReason == CloseReason.UserClosing) { e.Cancel = true; Hide(); tray.ShowBalloonTip(1500, WindowTitle, "助手保留在任务栏通知区域。右键图标可停止或退出。", ToolTipIcon.Info); } };
            timer.Interval = 1500; timer.Tick += async delegate { if (polling || busy) return; polling = true; try { ApplyHealth(await core.HealthAsync()); } catch (Exception e) { ShowError(e); } finally { polling = false; } };
            Shown += async delegate { if (autoStart) { timer.Start(); if (Program.Background) Hide(); await StartNow(); } };
            FormClosed += delegate { timer.Stop(); tray.Visible = false; tray.Dispose(); }; ApplyHealth(snapshot);
        }
        void ConfigureButton(Button button, string text, Color color) { button.Text = text; button.Width = 128; button.Height = 34; button.FlatStyle = FlatStyle.Flat; button.BackColor = color; button.Margin = new Padding(0, 0, 10, 0); }
        public void ApplyHealth(Snapshot value) {
            snapshot = value; stateTitle.Text = value.Ready ? "助手已就绪" : value.Failed ? "准备未完成" : value.Online ? "正在准备制作环境" : "助手尚未启动";
            stateMessage.Text = value.Message.Length > 0 ? value.Message : value.Ready ? "可以打开官网制作视频。首次切换到 App 版时，请在网页重新连接一次。" : "正在核对后台状态…";
            progress.Style = value.Online && !value.Ready && !value.Failed ? ProgressBarStyle.Marquee : ProgressBarStyle.Continuous; progress.Value = value.Ready ? 100 : 0;
            StartButton.Enabled = !busy && (!value.Online || value.Failed); OpenButton.Enabled = value.Ready; StopButton.Enabled = !busy && value.Online && (value.Ready || value.Failed);
            if (value.Failed) { log.Text = value.Message + Environment.NewLine + TailLog(); stateTitle.ForeColor = Color.Firebrick; } else stateTitle.ForeColor = Color.FromArgb(32, 39, 22);
        }
        string TailLog() { string s = core.DiagnosticText(snapshot); return s.Substring(Math.Max(0, s.Length - 5000)); }
        void ShowProgress(string stage, string message) { stateTitle.Text = "正在准备助手"; stateMessage.Text = message; progress.Style = ProgressBarStyle.Marquee; log.Text = TailLog(); }
        async Task StartNow() { if (busy) return; busy = true; StartButton.Enabled = false; StopButton.Enabled = false; try { await core.StartAsync(); ApplyHealth(await core.HealthAsync()); } catch (Exception e) { ShowError(e); } finally { busy = false; StartButton.Enabled = !snapshot.Online || snapshot.Failed; } }
        void ShowError(Exception e) { core.Log("错误：" + e.Message); snapshot.Failed = true; stateTitle.Text = "启动未完成"; stateTitle.ForeColor = Color.Firebrick; stateMessage.Text = e.Message; log.Text = TailLog(); progress.Style = ProgressBarStyle.Continuous; progress.Value = 0; StartButton.Enabled = true; OpenButton.Enabled = false; }
        public void SavePreview(string file) { CreateControl(); Show(); Application.DoEvents(); using (Bitmap bmp = new Bitmap(Width, Height)) { DrawToBitmap(bmp, new Rectangle(Point.Empty, Size)); bmp.Save(file, System.Drawing.Imaging.ImageFormat.Png); } }
    }

    internal static class Program {
        public static bool Background;
        public static readonly string AppRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "beepoptvc");
        public static readonly string InstalledExe = Path.Combine(AppRoot, "beepoptvc-Assistant-0.6.0.exe");
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
        [STAThread] public static int Main(string[] args) {
            try { SetProcessDPIAware(); } catch { }
            Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
            if (args.Length == 2 && args[0] == "--self-test") return SelfTest.Run(args[1]);
            Background = args.Length > 0 && args[0] == "--background";
            bool created; using (Mutex singleton = new Mutex(true, "Local\\beepoptvcNativeAssistant06", out created)) {
                if (!created) { using (EventWaitHandle ev = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\beepoptvcShow06")) ev.Set(); return 0; }
                try {
                    Directory.CreateDirectory(AppRoot); string current = Assembly.GetExecutingAssembly().Location;
                    if (!String.Equals(Path.GetFullPath(current), InstalledExe, StringComparison.OrdinalIgnoreCase)) File.Copy(current, InstalledExe, true);
                    try { CreateDesktopShortcut(); using (RegistryKey k = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run", true)) { if (k != null && k.GetValue("beepoptvcAssistant") != null) k.SetValue("beepoptvcAssistant", "\"" + InstalledExe + "\" --background"); } } catch { }
                    using (Core core = new Core(AppRoot, 47831)) using (MainForm form = new MainForm(core, true)) using (EventWaitHandle ev = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\beepoptvcShow06")) {
                        RegisteredWaitHandle waiter = ThreadPool.RegisterWaitForSingleObject(ev, delegate { if (form.IsHandleCreated && !form.IsDisposed) form.BeginInvoke((Action)delegate { form.Show(); form.WindowState = FormWindowState.Normal; form.Activate(); }); }, null, Timeout.Infinite, false);
                        try { Application.Run(form); } finally { waiter.Unregister(null); }
                    }
                    return 0;
                } catch (Exception e) { MessageBox.Show("助手无法启动：" + e.Message, MainForm.WindowTitle, MessageBoxButtons.OK, MessageBoxIcon.Error); return 1; }
            }
        }
        static void CreateDesktopShortcut() {
            Type type = Type.GetTypeFromProgID("WScript.Shell"); if (type == null) return;
            object shell = Activator.CreateInstance(type), link = null;
            try {
                string file = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "beepoptvc 助手.lnk");
                link = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { file }); Type lt = link.GetType();
                lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { InstalledExe });
                lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { AppRoot });
                lt.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { "打开 beepoptvc 本机制作助手" });
                lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, new object[0]);
            } finally { if (link != null) Marshal.FinalReleaseComObject(link); Marshal.FinalReleaseComObject(shell); }
        }
    }

    internal static class SelfTest {
        static void Assert(bool value, string message) { if (!value) throw new Exception("Self-test: " + message); }
        public static int Run(string root) {
            Directory.CreateDirectory(root);
            try {
                using (Core core = new Core(Path.GetFullPath(root), 47843)) {
                    core.Progress = delegate(string stage, string message) { File.AppendAllText(Path.Combine(root, "self-test.log"), stage + ": " + message + Environment.NewLine, Encoding.UTF8); };
                    Task.Run(async delegate {
                        // All child Node requests are blocked from external network in this test.
                        string guard = Path.Combine(root, "offline-guard.cjs");
                        File.WriteAllText(guard, Core.ResourceText("offline-guard.cjs"), Encoding.UTF8);
                        Environment.SetEnvironmentVariable("NODE_OPTIONS", "--require \"" + guard.Replace('\\', '/') + "\"");
                        await core.StartAsync(); Snapshot state = null;
                        for (int i = 0; i < 300; i++) { state = await core.HealthAsync(); if (state.Failed) throw new Exception(state.Message); if (state.Ready) break; await Task.Delay(1000); }
                        Assert(state != null && state.Ready, "embedded helper reaches ready");
                    }).GetAwaiter().GetResult();
                    Snapshot ready = core.HealthAsync().GetAwaiter().GetResult();
                    using (MainForm form = new MainForm(core, false)) {
                        form.ApplyHealth(ready); Assert(form.OpenButton.Enabled && !form.StartButton.Enabled && form.StopButton.Enabled, "native ready controls");
                        form.SavePreview(Path.Combine(root, "windows-app-ready.png"));
                        form.ApplyHealth(new Snapshot { Failed = true, Message = "测试错误：网络暂不可用。请查看日志后重试。" });
                        Assert(!form.OpenButton.Enabled && form.StartButton.Enabled, "failure is visible and retryable"); form.SavePreview(Path.Combine(root, "windows-app-error.png"));
                    }
                    core.StopAsync().GetAwaiter().GetResult(); core.WaitStoppedAsync().GetAwaiter().GetResult(); Assert(!core.HealthAsync().GetAwaiter().GetResult().Online, "authenticated background stop");
                    // Reproduce the user's missing-model failure and repair solely from the embedded package.
                    File.Delete(Path.Combine(core.Engine, "data", "models", "kokoro-v1", "onnx", "model.onnx"));
                    Task.Run(async delegate {
                        await core.StartAsync(); Snapshot state = null;
                        for (int i = 0; i < 300; i++) { state = await core.HealthAsync(); if (state.Failed) throw new Exception(state.Message); if (state.Ready) break; await Task.Delay(1000); }
                        Assert(state != null && state.Ready, "missing-model repair without external network");
                        await core.StopAsync(); await core.WaitStoppedAsync();
                    }).GetAwaiter().GetResult();
                    using (MemoryStream memory = new MemoryStream()) {
                        using (ZipArchive zip = new ZipArchive(memory, ZipArchiveMode.Create, true)) using (StreamWriter w = new StreamWriter(zip.CreateEntry("../escape.txt").Open())) w.Write("fixture");
                        memory.Position = 0; bool blocked = false; try { Core.ExtractSafe(memory, Path.Combine(root, "zip-guard"), ""); } catch (InvalidDataException) { blocked = true; } Assert(blocked, "zip traversal blocked");
                    }
                    File.WriteAllText(Path.Combine(root, "app-self-test.json"), new JavaScriptSerializer().Serialize(new { app = Core.AppVersion, nativeWinForms = true, embeddedNodeVerified = true, fullyBundledEnvironment = true, externalNodeNetworkBlocked = true, missingModelRepairVerified = true, noCmdOrPowerShellForLaunch = true, backendReady = true, nativeControlsReady = true, failureVisible = true, authenticatedStop = true, zipTraversalBlocked = true, payloadSha256 = core.PayloadHash, codexInferenceSubmitted = false }), Encoding.UTF8);
                    return 0;
                }
            } catch (Exception e) { File.WriteAllText(Path.Combine(root, "app-self-test-error.txt"), e.ToString(), Encoding.UTF8); return 1; }
        }
    }
}
