export const zhCN = {
  explorerTitle: "资源管理器",
  filePaneLabel: "项目文件",
  changesTitle: "变更",
  noChanges: "没有变更",
  noFileOpen: "未打开文件",
  selectFile: "从左侧选择一个文件",
  editorPaneLabel: "文件内容",
  chatPaneLabel: "Kitty 聊天",
  refreshFiles: "刷新文件",
  newFile: "新建文件",
  newFolder: "新建文件夹",
  renamePath: "重命名",
  deletePath: "删除",
  create: "创建",
  rename: "重命名",
  cancel: "取消",
  confirm: "确认",
  filePath: "文件路径",
  folderPath: "文件夹路径",
  newName: "新名称",
  createFileHelp: "相对路径；默认创建在当前选中的文件夹内。",
  createFolderHelp: "相对路径；默认创建在当前选中的文件夹内。",
  renameHelp: "可以只输入新名称，也可以输入新的相对路径。",
  deletePathConfirm: "确定删除这个路径吗？这个操作会直接删除本地文件。",
  pathRequired: "请输入路径。",
  saved: "已保存",
  fileMissing: "文件不存在",
  unsavedCloseConfirm: "当前文件有未保存修改，关闭后会丢失这些修改。确定关闭吗？",
  promptPlaceholder: "输入任务，Enter 发送，Shift+Enter 换行",
  send: "发送",
  stop: "停止",
  save: "保存",
  diff: "差异",
  closeFile: "关闭文件",
  ready: "Kitty 工作台已就绪。",
  server: "服务",
  you: "你",
  lead: "决策主脑",
  assistant: "助手",
  thinking: "思考",
  thinkingActive: "思考中",
  replyingActive: "回复中",
  tool: "工具",
  result: "结果",
  toolError: "工具错误",
  teammate: "队友",
  subagent: "子代理",
  dreaming: "做梦",
  background: "后台",
  workflow: "工作流",
  system: "系统",
  foreground: "前台",
  dispatch: "派发",
  status: "状态",
  error: "错误",
  idle: "空闲",
  running: "运行中",
  streaming: "回复中",
  "waiting for model": "等待模型",
  aborting: "正在中断",
  aborted: "已中断",
  completed: "已完成",
  paused: "已暂停",
  failed: "失败",
  online: "在线",
  offline: "离线",
  connecting: "连接中",
  modified: "已修改",
  truncated: "已截断",
  noActiveSpec: "未绑定 Spec",
  todoTitle: "任务",
};

export function t(key) {
  return zhCN[key] || key;
}

export function applyTranslations(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of root.querySelectorAll("[data-i18n-attr]")) {
    const pairs = node.dataset.i18nAttr.split(",");
    for (const pair of pairs) {
      const [attribute, key] = pair.split(":");
      if (attribute && key) {
        node.setAttribute(attribute, t(key));
      }
    }
  }
}
