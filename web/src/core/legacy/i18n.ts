// AUTO-GENERATED FROM legacy/index.html BY scripts/extract-legacy.mjs - DO NOT EDIT MANUALLY

export const T = {
  zh: {
    expand: "展开",
    collapse: "收起",
    guide: "引导",
    clear: "清空",
    genW: "✦ 生成世界观卡",
    genO: "✦ 生成组织卡",
    genC: "✦ 生成角色卡",
    needFill: (n: string | number) =>`还有 ${n} 栏必填未完成`,
    genOk: "已生成 ✓",
    empty: "还没有填写任何内容",
    madeCode: "草稿码已生成 ✓",
    codeCopied: "已复制 ✓",
    noCode: "请先生成",
    notCode: "请先粘贴",
    importOk: "导入成功 ✓",
    importFail: "导入失败：",
    cleared: "已清空 ✓",
    unnamed: "未命名",
    sampleFill: "已填入灵感",
    noInsp: "暂无灵感",
    guideOn: "引导开启",
    guideOff: "已退出",
    guideDone: "全部完成 ✓",
    next: "下一题",
    skip: "跳过",
    exit: "退出",
    tutSkip: "跳过教程",
    tutNext: "下一步",
    tutDone: "开始创作",
    req: "必填",
    opt: "选填",
    pText: (a: string | number, b: string | number) =>`必填 ${a}/${b}`,
    wText: (n: string | number) =>`${n} 字`,
    clearGroup: "清空本组",
    clearAllConfirm: "确定清空全部字段？此操作无法撤销。",
    clearGroupConfirm: (g: string | number) =>`确定清空「${g}」这一组的所有字段？`,
    clearAllDone: "已清空全部字段",
    clearGroupDone: (g: string | number) =>`已清空「${g}」`,
    backupOk: "备份已下载",
    backupFail: "导出失败：",
    restoreOk: "已导入备份 ✓",
    restoreFail: "导入失败：",
    restoreConfirm: "导入将合并到本机数据，是否继续？",
    restoreFormatErr: "文件格式不正确",
    codeKindErr: "这是%s草稿码，请到对应页面导入",
    memAdded: "已添加 %s 位成员",
    memRemoveConfirm: (n: string | number) =>`从「${n}」移除该角色？`,
    addMem: "添加成员",
    del: "删除",
    unknownTime: "时间不明",
    noEvents: "还没有事件。",
    tmplNew: "新建模板",
    tmplDel: "删除模板",
    tmplDelConfirm: (n: string | number) =>`确定删除模板「${n}」？`,
    tmplName: "模板名",
    tmplFields: "字段列表（每行「字段名」）",
    scrollHint: "（可滚动）",
    delConfirm: "确认删除",
    clearConfirm: "确认清空",
    importConfirm: "导入确认",
    requiredField: "此栏必填"
  },
  en: {
    expand: "Expand",
    collapse: "Collapse",
    guide: "Guide",
    clear: "Clear",
    genW: "✦ Generate World",
    genO: "✦ Generate Org",
    genC: "✦ Generate Character",
    needFill: (n: string | number) =>`${n} required missing`,
    genOk: "Generated ✓",
    empty: "Nothing filled yet",
    madeCode: "Code ready ✓",
    codeCopied: "Copied ✓",
    noCode: "Generate first",
    notCode: "Paste a code first",
    importOk: "Imported ✓",
    importFail: "Import failed: ",
    cleared: "Cleared ✓",
    unnamed: "Untitled",
    sampleFill: "Filled",
    noInsp: "No inspiration",
    guideOn: "Guide on",
    guideOff: "Guide off",
    guideDone: "Done ✓",
    next: "Next",
    skip: "Skip",
    exit: "Exit",
    tutSkip: "Skip",
    tutNext: "Next",
    tutDone: "Start",
    req: "Required",
    opt: "Optional",
    pText: (a: string | number, b: string | number) =>`Required ${a}/${b}`,
    wText: (n: string | number) =>`${n} chars`,
    clearGroup: "Clear group",
    clearAllConfirm: "Clear all fields?",
    clearGroupConfirm: (g: string | number) =>`Clear all in "${g}"?`,
    clearAllDone: "All cleared",
    clearGroupDone: (g: string | number) =>`"${g}" cleared`,
    backupOk: "Backup downloaded",
    backupFail: "Export failed: ",
    restoreOk: "Imported ✓",
    restoreFail: "Import failed: ",
    restoreConfirm: "Merge into local data?",
    restoreFormatErr: "Invalid format",
    codeKindErr: "This is a %s code",
    memAdded: "Added %s members",
    memRemoveConfirm: (n: string | number) =>`Remove from "${n}"?`,
    addMem: "Add member",
    del: "Delete",
    unknownTime: "Unknown",
    noEvents: "No events yet.",
    tmplNew: "New template",
    tmplDel: "Delete template",
    tmplDelConfirm: (n: string | number) =>`Delete template "${n}"?`,
    tmplName: "Template name",
    tmplFields: "Fields (one per line)",
    scrollHint: "(scrollable)",
    delConfirm: "Confirm Delete",
    clearConfirm: "Confirm Clear",
    importConfirm: "Confirm Import",
    requiredField: "Required"
  }
};

export const TUT: { zh: [string, string][]; en: [string, string][] } = {
  "zh": [
    [
      "欢迎",
      "v5.4 更新：账号云同步、在线大厅、世界观分享。手机号注册，换设备不丢设定。"
    ],
    [
      "世界观",
      "先建一个世界观。填写力量体系、地理、历史——这是所有角色和组织的舞台。"
    ],
    [
      "归属绑定",
      "角色里选「所属世界观」「所属组织」，会和世界观、组织的关联列表自动同步。"
    ],
    [
      "灵感库",
      "🎲 抽灵感。世界观还可以自建「特供灵感库」，只属于这个世界。"
    ],
    [
      "时间线",
      "在角色/组织里写「成立时间」「重要事件」，或到时间线页添加独立事件，自动汇总。"
    ],
    [
      "关系网",
      "三层可视化：角色人脉 + 组织归属 + 世界观归属，一张图看尽。"
    ],
    [
      "模板",
      "自定义字段集，可保存、导出、分享。切换模板时旧数据不会丢，会归档。"
    ],
    [
      "长文本",
      "长字段可滚动，点字段下方「展开」按钮临时放大到 600px。"
    ],
    [
      "草稿码",
      "跨设备续写。世界观用 CC3W，组织用 CC2O，角色用 CC2，互不干扰。"
    ],
    [
      "v5.3 新模块",
      "「剧情线」管卷/幕/章大纲，章节填时间自动进时间线；「场景卡」管每场戏；「术语表」支持全局改名；「看板」看字数趋势，还能算角色在某事件时几岁。"
    ],
    [
      "云同步与大厅",
      "手机号注册登录后，编辑自动备份到云端，换设备登录即恢复。「大厅」能看到谁在线、在创作什么，还能把自己的世界观分享给所有人。"
    ]
  ],
  "en": [
    [
      "Welcome",
      "v5.4: account cloud sync, online lobby, world sharing. Register with your phone — your settings follow you across devices."
    ],
    [
      "World",
      "Start with a world. Magic, geography, history — the stage for everything."
    ],
    [
      "Binding",
      "Set Character's World / Organizations — auto-syncs with World/Org lists."
    ],
    [
      "Inspiration",
      "🎲 for random ideas. World has its own custom inspiration library."
    ],
    [
      "Timeline",
      "Write \"founded\" or \"key events\" anywhere, or add events here. Auto-aggregated."
    ],
    [
      "Graph",
      "Three layers: char-relations + org-membership + world-affiliation."
    ],
    [
      "Templates",
      "Custom field sets, save / export / share. Old data archived, not lost."
    ],
    [
      "Long text",
      "Long fields scroll. Click \"Expand\" below to temporarily grow to 600px."
    ],
    [
      "Codes",
      "CC3W world, CC2O org, CC2 char — all independent."
    ],
    [
      "New in v5.3",
      "Plots (volume/act/chapter) sync to timeline; scene cards; glossary with global rename; dashboard with trends and an age calculator."
    ],
    [
      "Cloud sync & lobby",
      "Sign in with your phone — edits back up automatically and restore on any device. The lobby shows who is online and what they are creating; share your own world there."
    ]
  ]
};
