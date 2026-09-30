# Projects and execution locations

A project is a persistent link to a local directory or a remote repository URL. Conversations may have no project. The current product executes only on this computer; a remote URL is a reference and does not establish a cloud executor.

## API

- `GET /api/projects`, `GET /api/projects/:id`: public project records, including current `execution.status` (`ready` or `unavailable`) and a reason when unavailable.
- `POST /api/projects`: `{name,kind:"local",path,description?}` or `{name,kind:"remote",url,description?}`.
- `PUT /api/projects/:id`: edit name/description or `archived`. A location with task or room references cannot silently change. An unavailable local directory can still be archived. `DELETE` returns 405; archiving preserves references.
- `GET /api/projects/:id/files?path=src`: bounded directory metadata only. Returns `{projectId,path,entries:[{name,path,kind,size?,modifiedAt}],truncated,limit:200}`. No file body is returned. Traversal, symlinks, hidden and common secret/dependency paths are excluded.
- `POST /api/tasks` accepts `projectId`. Existing tasks cannot change projects.
- Agent room create/update accepts `projectId`; `null` removes its binding. New room tasks inherit the room project. Prior tasks retain their original binding. A room whose latest task is interrupted cannot change projects until that task is resolved; a new room can use another project.
- Bootstrap includes `projects`.

## Local execution and file protection

Local binding resolves an absolute readable directory and validates it again before execution. It may not overlap SecondU's own data/credential directory. Child demo spaces inherit the enclosing application's protected data root, so a project cannot expose another space's databases or task workspaces. The runner passes this directory as `workspace`; the Codex adapter uses it as process, thread and turn cwd, with its filesystem write permission bounded to that directory. The runtime home remains outside it. No-project tasks retain their isolated task directory.

Tasks in overlapping project directories cannot run concurrently in the same runner. A failed start or continue does not append a misleading user message. The project cannot be changed while its task runs. This does not lock unrelated external editors or separate SecondU server processes.

Before a project task runs, the collector snapshots file metadata, with 4,000-entry and 12-level limits. After tools stop, it considers only newly created or changed eligible text files. A partial initial snapshot disables automatic collection and records a warning. Hidden paths, dependencies, common secret filenames, private keys and credential-bearing contents are excluded. Per-file limit is 1 MiB; a collection accepts at most 50 files and 5 MiB. This is a conservative bounded collector, not a comprehensive secret scanner.

Collected files keep their project-relative names, such as `src/main.ts`. Collection stores a version snapshot without rewriting the original file or its permissions. Saving an edit also preserves an existing project file's ordinary permission bits. A plain reply creates no file. Real files left by a failed or cancelled task remain pending review. Project demo documents use a task-specific name and cannot overwrite existing untracked files.

Editing an artifact fails with 409 if the project file has changed outside SecondU. Deleting a project task removes its records but retains project files. Artifact deletion does not delete project originals. Historical downloads still return the recorded version snapshot.

## Verification boundary

`tests/projects.test.mjs` uses temporary local directories and a local execution fixture. It checks actual workspace arguments, project/no-project separation, new/modified-file collection, exclusions, preserved file modes, invalid paths, read-only bounded listing, overlap blocking, room inheritance, archival and external-edit conflicts. No user keys, real private repositories or paid model calls are used. Remote execution is not implemented.


## 创建项目与系统目录选择

创建弹窗使用紧凑的名称、源文件夹和可选备注。桌面版复用 Electron `chooseDirectory`；浏览器点击“添加”时通过 `POST /api/projects/choose-directory` 打开运行本机服务的系统选择器，返回 `{path:string|null}`。取消返回 null，不创建项目、不读取目录内容，也不更改已有路径。真正保存仍经过已有项目目录校验。

桌面桥仅接受当前 SecondU 主 frame 的请求，同一时间只打开一个原生选择窗口。用户完成选择后再次验证请求页面；期间发生页面重载、导航或窗口关闭时不返回旧页面的选择结果。`tests/directory-picker.test.mjs` 同时覆盖桌面桥和浏览器端点的选择、取消、重复调用及失败恢复。

端点复用 localhost、来源与 JSON 防护，拒绝额外命令或路径参数；一台服务同时只允许一个选择窗口，选择超时为两分钟。macOS 使用固定 AppleScript 的 `choose folder`，Windows 使用固定 PowerShell `FolderBrowserDialog`，Linux 使用已安装的 Zenity；缺少桌面环境或选择器时显示错误并提供手填路径。所有平台均不拼接用户字符串到命令中；不会把取消误报为路径。Windows/Linux 目前只有调用夹具验证，没有该系统实机验收。

2026-09-29 在当前源码构建的开发版 Electron 中完成 macOS 实机验收：点击“添加”打开系统目录窗口，选择专用空目录后返回绝对路径并自动填入项目名；再次打开选择器并取消，原选择与名称保持不变。最终取消创建，没有新增项目或读取目录文件。此证据覆盖当前开发构建，不等同于重新打包或已安装应用更新。

远程项目仍仅保存链接并显示 Dev，未连接远程执行器。没有加入项目专属记忆开关。

官方依据：[Apple 目录选择](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/PromptforaFileorFolder.html)、[Microsoft FolderBrowserDialog](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.folderbrowserdialog)。
