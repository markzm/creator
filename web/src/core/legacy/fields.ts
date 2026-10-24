// AUTO-GENERATED FROM legacy/index.html BY scripts/extract-legacy.mjs - DO NOT EDIT MANUALLY

export interface LegacyFieldDef {
  id: string;
  l: string;
  lE: string;
  r: number;
  w?: number;
  ph: string;
  h: string;
}

export interface LegacyFieldGroup {
  t: string;
  tE: string;
  f: LegacyFieldDef[];
}

export const CHAR_OLD: string[] = [
  "name",
  "alias",
  "gender",
  "age",
  "race",
  "job",
  "identity",
  "body",
  "color",
  "clothes",
  "impression",
  "feature",
  "personality",
  "good_at",
  "bad_at",
  "habit",
  "like",
  "hate",
  "power",
  "weapon",
  "item",
  "weakness",
  "growth",
  "event",
  "now",
  "family",
  "friends",
  "enemies",
  "key_person",
  "dream",
  "catchphrase",
  "symbol",
  "extra"
];

export const CG: LegacyFieldGroup[] = [
  {
    "t": "基础信息",
    "tE": "Basic",
    "f": [
      {
        "id": "name",
        "l": "姓名",
        "lE": "Name",
        "r": 1,
        "ph": "艾德里安·沃尔斯",
        "h": "完整姓名，含姓氏与名字。"
      },
      {
        "id": "alias",
        "l": "别名",
        "lE": "Alias",
        "r": 1,
        "ph": "暗影之刃、小艾",
        "h": "绰号、代号、头衔，用「、」分隔。"
      },
      {
        "id": "gender",
        "l": "性别",
        "lE": "Gender",
        "r": 1,
        "ph": "女",
        "h": "性别或性别认同。"
      },
      {
        "id": "age",
        "l": "年龄",
        "lE": "Age",
        "r": 1,
        "ph": "外表18岁 / 实际217岁",
        "h": "长寿种族写「外表 X / 实际 Y」。"
      },
      {
        "id": "race",
        "l": "种族",
        "lE": "Race",
        "r": 1,
        "ph": "从世界观的种族表选",
        "h": "建议从所属世界观的种族表中选择。"
      },
      {
        "id": "job",
        "l": "职业",
        "lE": "Job",
        "r": 1,
        "ph": "流浪炼金术士",
        "h": "赖以谋生的工作。"
      },
      {
        "id": "identity",
        "l": "身份",
        "lE": "Identity",
        "r": 1,
        "ph": "骑士团副团长",
        "h": "社会或组织中的立场。"
      },
      {
        "id": "morality",
        "l": "道德观",
        "lE": "Morality",
        "r": 0,
        "ph": "中立偏善",
        "h": "善—恶、秩序—自由两轴位置。"
      },
      {
        "id": "fear",
        "l": "核心恐惧",
        "lE": "Core Fear",
        "r": 0,
        "ph": "最怕变成当年的父亲",
        "h": "最怕失去或变成什么。"
      },
      {
        "id": "trauma",
        "l": "创伤",
        "lE": "Trauma",
        "r": 0,
        "ph": "12岁目睹家园被焚",
        "h": "过去影响至今的事。"
      },
      {
        "id": "secret",
        "l": "秘密",
        "lE": "Secret",
        "r": 0,
        "ph": "右手其实不是自己的",
        "h": "绝不想让人知道的事。"
      },
      {
        "id": "principle",
        "l": "原则底线",
        "lE": "Principles",
        "r": 0,
        "ph": "绝不杀投降之人",
        "h": "绝对不做的事。"
      },
      {
        "id": "faith",
        "l": "信仰",
        "lE": "Faith",
        "r": 0,
        "ph": "不信神，但敬畏死亡",
        "h": "建议从世界观的宗教表中选择。"
      },
      {
        "id": "self_view",
        "l": "自我认知",
        "lE": "Self View",
        "r": 0,
        "ph": "自认冷酷，其实心软",
        "h": "自认什么样；和实际差多少。"
      },
      {
        "id": "life_stage",
        "l": "人生阶段",
        "lE": "Life Stage",
        "r": 0,
        "ph": "迷茫期",
        "h": "迷茫/巅峰/下坡。"
      }
    ]
  },
  {
    "t": "归属与绑定",
    "tE": "Affiliation",
    "f": [
      {
        "id": "world",
        "l": "所属世界观",
        "lE": "World",
        "r": 0,
        "ph": "从世界观库选",
        "h": "角色的出生世界观。留空表示未指定。"
      },
      {
        "id": "homeland",
        "l": "籍贯 / 出身地",
        "lE": "Homeland",
        "r": 0,
        "ph": "从世界观的「地点」选",
        "h": "出生或成长的地点。"
      },
      {
        "id": "orgs",
        "l": "所属组织",
        "lE": "Organizations",
        "r": 0,
        "w": 1,
        "ph": "暮光议会 | 首席法师 | 301-320 | 在职\n银月同盟 | 外围成员 | 320- | 在职",
        "h": "每行：「组织名 | 职位 | 任期 | 状态」。会与组织成员列表自动同步。"
      },
      {
        "id": "langs",
        "l": "掌握语言",
        "lE": "Languages",
        "r": 0,
        "ph": "通用语、精灵语、龙语",
        "h": "建议从世界观的「语言」表中选择。"
      }
    ]
  },
  {
    "t": "外貌与气质",
    "tE": "Appearance",
    "f": [
      {
        "id": "body",
        "l": "身高/体重",
        "lE": "Height/Weight",
        "r": 1,
        "ph": "172cm / 55kg，偏瘦",
        "h": "「/」分隔，可加体型。"
      },
      {
        "id": "color",
        "l": "发色/瞳色",
        "lE": "Hair/Eyes",
        "r": 1,
        "ph": "银白短发 / 琥珀色瞳",
        "h": "发色与瞳色，可加变色状态。"
      },
      {
        "id": "clothes",
        "l": "服装",
        "lE": "Clothing",
        "r": 1,
        "w": 1,
        "ph": "深灰长风衣 + 皮质护腕 + 旧怀表",
        "h": "颜色、材质、配件。"
      },
      {
        "id": "impression",
        "l": "气质印象",
        "lE": "Impression",
        "r": 1,
        "w": 1,
        "ph": "安静、疏离，像随时会消失",
        "h": "初次见面的整体感觉。"
      },
      {
        "id": "feature",
        "l": "标志特征",
        "lE": "Signature",
        "r": 1,
        "w": 1,
        "ph": "左眼下旧疤 + 银尾戒",
        "h": "一眼认出他的细节。"
      },
      {
        "id": "voice",
        "l": "声线",
        "lE": "Voice",
        "r": 0,
        "ph": "低哑，语速慢",
        "h": "语速、口癖、情绪变化。"
      },
      {
        "id": "idiom",
        "l": "惯用语",
        "lE": "Idioms",
        "r": 0,
        "ph": "打招呼常说“又是你啊”",
        "h": "打招呼、道别的方式。"
      },
      {
        "id": "sleep",
        "l": "作息",
        "lE": "Sleep",
        "r": 0,
        "ph": "夜猫子，凌晨三点才睡",
        "h": "作息、睡眠、做梦。"
      },
      {
        "id": "food",
        "l": "饮食",
        "lE": "Food",
        "r": 0,
        "ph": "嗜甜，讨厌苦瓜",
        "h": "爱吃什么、忌口、会做饭吗。"
      },
      {
        "id": "money",
        "l": "金钱观",
        "lE": "Money",
        "r": 0,
        "ph": "收入不低，但存不下钱",
        "h": "抠门/挥霍/无所谓。"
      },
      {
        "id": "places",
        "l": "常去地点",
        "lE": "Spots",
        "r": 0,
        "ph": "城南旧书店、屋顶",
        "h": "住处、常泡的店。"
      },
      {
        "id": "belongings",
        "l": "随身物品",
        "lE": "Belongings",
        "r": 0,
        "ph": "半盒烟、旧地图、褪色照片",
        "h": "包里常备什么。"
      },
      {
        "id": "dress_style",
        "l": "穿衣风格",
        "lE": "Dress Style",
        "r": 0,
        "ph": "只穿黑色，简洁",
        "h": "为什么这么穿。"
      },
      {
        "id": "leisure",
        "l": "休闲方式",
        "lE": "Leisure",
        "r": 0,
        "ph": "钓鱼、看云、修钟表",
        "h": "不工作时干什么。"
      },
      {
        "id": "quirks",
        "l": "小毛病",
        "lE": "Quirks",
        "r": 0,
        "ph": "咬指甲、路痴",
        "h": "下意识的小毛病。"
      },
      {
        "id": "palette",
        "l": "代表色",
        "lE": "Palette",
        "r": 0,
        "ph": "灰蓝 + 暗金",
        "h": "主色、辅色、禁忌色。"
      },
      {
        "id": "motif",
        "l": "意象",
        "lE": "Motif",
        "r": 0,
        "ph": "黑鸢尾 + 乌鸦 + 落雪",
        "h": "代表花、动物、意象。"
      },
      {
        "id": "theme_song",
        "l": "主题曲",
        "lE": "Theme",
        "r": 0,
        "ph": "《Weight of the World》",
        "h": "情绪锚点。"
      },
      {
        "id": "birthday",
        "l": "生日",
        "lE": "Birthday",
        "r": 0,
        "ph": "11月23日 / 射手座 / AB型",
        "h": "生日、星座、血型。"
      },
      {
        "id": "signature",
        "l": "字迹",
        "lE": "Signature",
        "r": 0,
        "ph": "字迹锋利，爱连笔",
        "h": "写字与签名风格。"
      },
      {
        "id": "scent",
        "l": "气味",
        "lE": "Scent",
        "r": 0,
        "ph": "旧书和烟草味",
        "h": "身上和房间的味道。"
      },
      {
        "id": "light",
        "l": "光线偏好",
        "lE": "Light",
        "r": 0,
        "ph": "常出现在黄昏和烛光下",
        "h": "喜欢什么光线下出现。"
      }
    ]
  },
  {
    "t": "性格与偏好",
    "tE": "Personality",
    "f": [
      {
        "id": "personality",
        "l": "性格",
        "lE": "Personality",
        "r": 1,
        "w": 1,
        "ph": "表面冷淡，实则护短",
        "h": "核心性格 + 矛盾点。"
      },
      {
        "id": "good_at",
        "l": "擅长",
        "lE": "Good At",
        "r": 1,
        "w": 1,
        "ph": "追踪、调香、拆锁",
        "h": "技能、特长、生活技能。"
      },
      {
        "id": "bad_at",
        "l": "不擅长",
        "lE": "Bad At",
        "r": 1,
        "w": 1,
        "ph": "说谎、应对感谢、心算",
        "h": "不会做的事。"
      },
      {
        "id": "habit",
        "l": "习惯",
        "lE": "Habit",
        "r": 1,
        "w": 1,
        "ph": "思考时转动旧怀表",
        "h": "下意识的小动作。"
      },
      {
        "id": "like",
        "l": "喜欢",
        "lE": "Likes",
        "r": 1,
        "w": 1,
        "ph": "雨声、甜食、旧书气味",
        "h": "喜欢的人事物。"
      },
      {
        "id": "hate",
        "l": "讨厌",
        "lE": "Hates",
        "r": 1,
        "w": 1,
        "ph": "被从背后靠近、喧闹宴会",
        "h": "反感的人事物。"
      },
      {
        "id": "stranger_attitude",
        "l": "对陌生人",
        "lE": "To Strangers",
        "r": 0,
        "ph": "礼貌但疏离",
        "h": "热情/疏离/警惕/漠然。"
      },
      {
        "id": "romance",
        "l": "恋爱观",
        "lE": "Romance",
        "r": 0,
        "ph": "异性恋，但没时间恋爱",
        "h": "是否渴望亲密、如何表达。"
      },
      {
        "id": "friendship",
        "l": "友情模式",
        "lE": "Friendship",
        "r": 0,
        "ph": "朋友不多，但个个过命",
        "h": "交友、维护、翻脸。"
      },
      {
        "id": "family_view",
        "l": "亲情观",
        "lE": "Family View",
        "r": 0,
        "ph": "家人是负担，也是底线",
        "h": "对家的定义。"
      },
      {
        "id": "trust_threshold",
        "l": "信任门槛",
        "lE": "Trust",
        "r": 0,
        "ph": "要共事半年才说真心话",
        "h": "多久才会信任一个人。"
      },
      {
        "id": "betrayal_reaction",
        "l": "背叛反应",
        "lE": "Betrayal",
        "r": 0,
        "ph": "不报复，但会彻底删除",
        "h": "报复/沉默/自疑。"
      },
      {
        "id": "social_mask",
        "l": "社交面具",
        "lE": "Mask",
        "r": 0,
        "ph": "上级面前乖顺，同伴面前放飞",
        "h": "面对不同人的样子。"
      },
      {
        "id": "home_like",
        "l": "像家的地方",
        "lE": "Home-like",
        "r": 0,
        "ph": "老友的酒馆",
        "h": "不一定是家人。"
      }
    ]
  },
  {
    "t": "能力与战斗",
    "tE": "Power",
    "f": [
      {
        "id": "power",
        "l": "特殊能力",
        "lE": "Power",
        "r": 1,
        "w": 1,
        "ph": "影步——阴影间跳跃，代价是短暂失明",
        "h": "名称、效果、代价。没有就写「无」并说明。"
      },
      {
        "id": "power_source",
        "l": "能力来源",
        "lE": "Power Source",
        "r": 0,
        "ph": "从世界观的能量来源选",
        "h": "建议从世界观的「力量体系」中选择。"
      },
      {
        "id": "power_cost",
        "l": "能力代价",
        "lE": "Power Cost",
        "r": 0,
        "ph": "连用三次就会昏厥",
        "h": "何时失效/反噬。"
      },
      {
        "id": "power_attitude",
        "l": "对能力的看法",
        "lE": "Power Attitude",
        "r": 0,
        "ph": "以此为耻，想摆脱",
        "h": "为荣/为耻/无所谓。"
      },
      {
        "id": "fight_style",
        "l": "战斗风格",
        "lE": "Fight Style",
        "r": 0,
        "ph": "技巧型，先看再出手",
        "h": "莽撞/技巧/算计/支援。"
      },
      {
        "id": "fight_weakness",
        "l": "战斗弱点",
        "lE": "Combat Weakness",
        "r": 0,
        "ph": "太护短，同伴受伤就失去冷静",
        "h": "性格弱点而非数值。"
      },
      {
        "id": "signature_move",
        "l": "必杀技",
        "lE": "Signature Move",
        "r": 0,
        "ph": "无声三连斩",
        "h": "观众最期待的那一下。"
      },
      {
        "id": "weapon",
        "l": "武器",
        "lE": "Weapon",
        "r": 0,
        "w": 1,
        "ph": "无锋长剑「静默」",
        "h": "常用武器的名称、外形与特性。"
      },
      {
        "id": "weapon_relation",
        "l": "武器关系",
        "lE": "Weapon Bond",
        "r": 0,
        "ph": "武器是亡兄遗物",
        "h": "工具/伙伴/枷锁。"
      },
      {
        "id": "item",
        "l": "特殊道具",
        "lE": "Item",
        "r": 0,
        "w": 1,
        "ph": "一只停摆的怀表",
        "h": "随身携带、对角色或剧情有特殊意义的物品。"
      },
      {
        "id": "after_battle",
        "l": "战后状态",
        "lE": "After Battle",
        "r": 0,
        "ph": "独自躲起来处理伤口",
        "h": "虚脱/亢奋/冷静/自责。"
      },
      {
        "id": "weakness",
        "l": "各方面弱点",
        "lE": "Weakness",
        "r": 0,
        "w": 1,
        "ph": "怕水；无光处无法使用能力",
        "h": "生理、心理与能力上的短板。"
      }
    ]
  },
  {
    "t": "经历与处境",
    "tE": "Background",
    "f": [
      {
        "id": "growth",
        "l": "成长经历",
        "lE": "Upbringing",
        "r": 1,
        "w": 1,
        "ph": "出生边境小镇，12岁村庄被焚……",
        "h": "从出生到现在的关键背景。"
      },
      {
        "id": "event",
        "l": "重要事件",
        "lE": "Key Event",
        "r": 1,
        "w": 1,
        "ph": "17岁放走本该处刑的挚友",
        "h": "改变人生轨迹的事件。"
      },
      {
        "id": "now",
        "l": "目前状况",
        "lE": "Now",
        "r": 1,
        "w": 1,
        "ph": "以赏金猎人身份流浪，追查一枚怀表",
        "h": "故事开始时的处境。"
      },
      {
        "id": "turning_points",
        "l": "转折点",
        "lE": "Turning Points",
        "r": 0,
        "w": 1,
        "ph": "12岁村庄被焚、17岁杀师、24岁入团",
        "h": "3–5 个改变人生的事件。"
      },
      {
        "id": "mystery",
        "l": "未解之谜",
        "lE": "Mysteries",
        "r": 0,
        "w": 1,
        "ph": "不记得10岁之前的事",
        "h": "连他自己也不知道答案。"
      },
      {
        "id": "former_identity",
        "l": "旧身份",
        "lE": "Former Identity",
        "r": 0,
        "w": 1,
        "ph": "曾是帝国首席剑士",
        "h": "曾是，为什么失去。"
      },
      {
        "id": "unfinished",
        "l": "未完成的事",
        "lE": "Unfinished",
        "r": 0,
        "w": 1,
        "ph": "答应给妹妹的生日礼物还没买",
        "h": "想做但没做成的事。"
      },
      {
        "id": "future_plan",
        "l": "未来打算",
        "lE": "Future",
        "r": 0,
        "w": 1,
        "ph": "攒够钱就离开这座城市",
        "h": "短期目标+长期梦想。"
      },
      {
        "id": "legacy",
        "l": "传承",
        "lE": "Legacy",
        "r": 0,
        "w": 1,
        "ph": "从师父那里继承了剑术和一封未拆的信",
        "h": "从谁那里继承了什么。"
      }
    ]
  },
  {
    "t": "人物关系",
    "tE": "Relationships",
    "f": [
      {
        "id": "family",
        "l": "家人",
        "lE": "Family",
        "r": 1,
        "w": 1,
        "ph": "父亲（已故，铁匠）、妹妹（失散）",
        "h": "关系、现状、态度。"
      },
      {
        "id": "friends",
        "l": "朋友",
        "lE": "Friends",
        "r": 1,
        "w": 1,
        "ph": "旅店老板娘玛尔塔",
        "h": "挚友、同伴、搭档。"
      },
      {
        "id": "enemies",
        "l": "敌人",
        "lE": "Enemies",
        "r": 1,
        "w": 1,
        "ph": "圣殿审判官维恩",
        "h": "仇敌、宿敌、敌对原因。"
      },
      {
        "id": "key_person",
        "l": "重要人物",
        "lE": "Key Person",
        "r": 1,
        "w": 1,
        "ph": "老师伊莱亚斯",
        "h": "影响最深的那个人。"
      },
      {
        "id": "relations",
        "l": "关系（关系网用）",
        "lE": "Relations",
        "r": 0,
        "w": 1,
        "ph": "玛尔塔 | 盟友 | 唯一给他留灯的人\n维恩 | 敌人 | 圣殿审判官",
        "h": "每行：「姓名 | 关系 | 备注」。类型：家人/盟友/敌人/恋人/其他。"
      }
    ]
  },
  {
    "t": "内核与符号",
    "tE": "Core",
    "f": [
      {
        "id": "dream",
        "l": "梦想",
        "lE": "Dream",
        "r": 1,
        "w": 1,
        "ph": "想找到一个不会被任何人找到的家",
        "h": "他真正想要的东西。"
      },
      {
        "id": "catchphrase",
        "l": "口头禅",
        "lE": "Catchphrase",
        "r": 1,
        "w": 1,
        "ph": "「麻烦。」——说完还是会去做",
        "h": "常挂在嘴边的话。"
      },
      {
        "id": "symbol",
        "l": "代表物",
        "lE": "Symbol",
        "r": 1,
        "w": 1,
        "ph": "停摆的怀表 + 灰蓝色 + 雨夜",
        "h": "象征他的物品、颜色、意象。"
      },
      {
        "id": "morality_gap",
        "l": "道德灰色地带",
        "lE": "Moral Grey",
        "r": 0,
        "w": 1,
        "ph": "反对杀人，却会为救人屠一村",
        "h": "原则何时会被打破。"
      },
      {
        "id": "strength_kernel",
        "l": "内核一句话",
        "lE": "Kernel",
        "r": 0,
        "w": 1,
        "ph": "一个被世界伤透，却仍在救人的傻子",
        "h": "一句话概括内核。"
      }
    ]
  },
  {
    "t": "其他",
    "tE": "Extra",
    "f": [
      {
        "id": "extra",
        "l": "附",
        "lE": "Extra",
        "r": 0,
        "w": 1,
        "ph": "选填",
        "h": "补充设定。"
      }
    ]
  }
];

export const CHAR_ORDER: string[] = [
  "name",
  "alias",
  "gender",
  "age",
  "race",
  "job",
  "identity",
  "morality",
  "fear",
  "trauma",
  "secret",
  "principle",
  "faith",
  "self_view",
  "life_stage",
  "world",
  "homeland",
  "orgs",
  "langs",
  "body",
  "color",
  "clothes",
  "impression",
  "feature",
  "voice",
  "idiom",
  "sleep",
  "food",
  "money",
  "places",
  "belongings",
  "dress_style",
  "leisure",
  "quirks",
  "palette",
  "motif",
  "theme_song",
  "birthday",
  "signature",
  "scent",
  "light",
  "personality",
  "good_at",
  "bad_at",
  "habit",
  "like",
  "hate",
  "stranger_attitude",
  "romance",
  "friendship",
  "family_view",
  "trust_threshold",
  "betrayal_reaction",
  "social_mask",
  "home_like",
  "power",
  "power_source",
  "power_cost",
  "power_attitude",
  "fight_style",
  "fight_weakness",
  "signature_move",
  "weapon",
  "weapon_relation",
  "item",
  "after_battle",
  "weakness",
  "growth",
  "event",
  "now",
  "turning_points",
  "mystery",
  "former_identity",
  "unfinished",
  "future_plan",
  "legacy",
  "family",
  "friends",
  "enemies",
  "key_person",
  "relations",
  "dream",
  "catchphrase",
  "symbol",
  "morality_gap",
  "strength_kernel",
  "extra"
];

export const OG: LegacyFieldGroup[] = [
  {
    "t": "基础信息",
    "tE": "Basic",
    "f": [
      {
        "id": "o_name",
        "l": "名称",
        "lE": "Name",
        "r": 1,
        "ph": "暮光议会",
        "h": "正式名称。"
      },
      {
        "id": "o_alias",
        "l": "简称别称",
        "lE": "Aliases",
        "r": 1,
        "ph": "议会、暗夜之手",
        "h": "内部、敌人、民间的叫法。"
      },
      {
        "id": "o_type",
        "l": "类型",
        "lE": "Type",
        "r": 1,
        "ph": "秘密结社",
        "h": "公会/公司/军队/教团/帮派/国家/学派。"
      },
      {
        "id": "o_founded",
        "l": "成立时间",
        "lE": "Founded",
        "r": 1,
        "ph": "约三百年前",
        "h": "具体或模糊时间。"
      },
      {
        "id": "o_hq",
        "l": "总部",
        "lE": "HQ",
        "r": 1,
        "ph": "北境雾谷要塞",
        "h": "从世界观的「地点」选，或自填。"
      },
      {
        "id": "o_scale",
        "l": "规模",
        "lE": "Scale",
        "r": 1,
        "ph": "几百人，分布于三国",
        "h": "几人到遍布大陆。"
      },
      {
        "id": "o_visibility",
        "l": "公开程度",
        "lE": "Visibility",
        "r": 1,
        "ph": "半公开",
        "h": "公开/半公开/秘密/传说级。"
      },
      {
        "id": "o_world",
        "l": "所属世界观",
        "lE": "World",
        "r": 0,
        "ph": "从世界观库选",
        "h": "所属世界观，留空表示跨世界。"
      },
      {
        "id": "o_creed_line",
        "l": "宗旨口号",
        "lE": "Motto",
        "r": 1,
        "ph": "在黑暗中守护光",
        "h": "一句话概括存在理由。"
      }
    ]
  },
  {
    "t": "组织架构",
    "tE": "Structure",
    "f": [
      {
        "id": "o_leader",
        "l": "领袖",
        "lE": "Leader",
        "r": 0,
        "ph": "大议长伊莱亚斯",
        "h": "名称、身份、在位时间。"
      },
      {
        "id": "o_power",
        "l": "权力结构",
        "lE": "Power Structure",
        "r": 0,
        "ph": "长老会，七席议事",
        "h": "独裁/议会/长老会/民主/神权。"
      },
      {
        "id": "o_core",
        "l": "核心层",
        "lE": "Inner Circle",
        "r": 0,
        "w": 1,
        "ph": "三位大长老、一位首席法师",
        "h": "3–5 个关键人物。"
      },
      {
        "id": "o_branches",
        "l": "分支部门",
        "lE": "Branches",
        "r": 0,
        "w": 1,
        "ph": "情报部、战斗部、研究部",
        "h": "内部分支。"
      },
      {
        "id": "o_promotion",
        "l": "晋升机制",
        "lE": "Promotion",
        "r": 0,
        "ph": "靠功绩和推荐",
        "h": "怎么往上爬。"
      },
      {
        "id": "o_members",
        "l": "成员构成",
        "lE": "Membership",
        "r": 0,
        "ph": "各族都有，人类和精灵为主",
        "h": "种族、阶级、招募。"
      },
      {
        "id": "o_entry",
        "l": "入会条件",
        "lE": "Entry",
        "r": 0,
        "ph": "需两名成员推荐",
        "h": "资格、仪式、推荐。"
      },
      {
        "id": "o_exit",
        "l": "退出机制",
        "lE": "Exit",
        "r": 0,
        "ph": "允许退出，但会抹去记忆",
        "h": "能退吗？退了会怎样。"
      }
    ]
  },
  {
    "t": "文化氛围",
    "tE": "Culture",
    "f": [
      {
        "id": "o_belief",
        "l": "组织信条",
        "lE": "Beliefs",
        "r": 0,
        "w": 1,
        "ph": "所有成员都是彼此的刀与盾",
        "h": "成员被要求相信什么。"
      },
      {
        "id": "o_culture",
        "l": "内部文化",
        "lE": "Culture",
        "r": 0,
        "ph": "等级森严，但绝对互助",
        "h": "等级森严/平等/混乱/家文化。"
      },
      {
        "id": "o_rituals",
        "l": "仪式传统",
        "lE": "Rituals",
        "r": 0,
        "w": 1,
        "ph": "入会时在左腕刺黑鸢尾",
        "h": "入会、庆典、葬礼。"
      },
      {
        "id": "o_uniform",
        "l": "制服徽记",
        "lE": "Uniform",
        "r": 0,
        "w": 1,
        "ph": "黑长袍，左胸绣银月",
        "h": "视觉识别核心。"
      },
      {
        "id": "o_slogan",
        "l": "口号暗语",
        "lE": "Slogan",
        "r": 0,
        "w": 1,
        "ph": "「月落之时，你我同行」",
        "h": "黑话、暗号。"
      },
      {
        "id": "o_taboo",
        "l": "禁忌",
        "lE": "Taboo",
        "r": 0,
        "ph": "严禁对同伴出手",
        "h": "绝对禁止及惩罚。"
      },
      {
        "id": "o_image",
        "l": "对外形象",
        "lE": "Public Image",
        "r": 0,
        "ph": "外界眼中的神秘慈善团体",
        "h": "外界怎么看它。"
      }
    ]
  },
  {
    "t": "资源实力",
    "tE": "Resources",
    "f": [
      {
        "id": "o_economy",
        "l": "经济来源",
        "lE": "Economy",
        "r": 0,
        "ph": "控制北境三条商路",
        "h": "靠什么养活自己。"
      },
      {
        "id": "o_military",
        "l": "军事力量",
        "lE": "Military",
        "r": 0,
        "ph": "三百精锐，另有古代兵偶",
        "h": "武力级别。"
      },
      {
        "id": "o_intel",
        "l": "情报网络",
        "lE": "Intelligence",
        "r": 0,
        "ph": "遍布三国，以茶馆为据点",
        "h": "情报能力。"
      },
      {
        "id": "o_special",
        "l": "特殊资源",
        "lE": "Assets",
        "r": 0,
        "w": 1,
        "ph": "雾谷铁矿 + 不完整的古神遗物",
        "h": "独有的矿脉、秘术、遗物、技术。"
      },
      {
        "id": "o_allies",
        "l": "盟友",
        "lE": "Allies",
        "r": 0,
        "ph": "北境商会、自由佣兵联盟",
        "h": "谁在支持它。"
      },
      {
        "id": "o_foes",
        "l": "敌对势力",
        "lE": "Rivals",
        "r": 0,
        "w": 1,
        "ph": "光明教廷，对峙百年",
        "h": "谁在对抗它，为什么。"
      },
      {
        "id": "o_territory",
        "l": "地盘",
        "lE": "Territory",
        "r": 0,
        "ph": "北境雾谷及周边三城",
        "h": "控制区域。"
      }
    ]
  },
  {
    "t": "历史目标",
    "tE": "History",
    "f": [
      {
        "id": "o_origin",
        "l": "创立故事",
        "lE": "Origin",
        "r": 0,
        "w": 1,
        "ph": "三百年前，七位被逐出学院的学者结盟",
        "h": "谁创立的、为什么。"
      },
      {
        "id": "o_history",
        "l": "关键历史",
        "lE": "History",
        "r": 0,
        "w": 1,
        "ph": "两百年前雾谷之战、八十年前分裂",
        "h": "3–5 个关键事件。"
      },
      {
        "id": "o_goal",
        "l": "当前目标",
        "lE": "Goal",
        "r": 0,
        "w": 1,
        "ph": "寻找失落的下半部古神遗物",
        "h": "现在在忙什么。"
      },
      {
        "id": "o_vision",
        "l": "长期愿景",
        "lE": "Vision",
        "r": 0,
        "ph": "让北境脱离教廷掌控",
        "h": "最终想达成什么。"
      },
      {
        "id": "o_conflict",
        "l": "内部矛盾",
        "lE": "Conflict",
        "r": 0,
        "w": 1,
        "ph": "年轻一代主张开放，老一辈坚持封闭",
        "h": "正在撕裂的问题。"
      },
      {
        "id": "o_threat",
        "l": "外部威胁",
        "lE": "Threat",
        "r": 0,
        "ph": "教廷正在策划一场清洗",
        "h": "正在面临的危机。"
      },
      {
        "id": "o_secret",
        "l": "秘密",
        "lE": "Secret",
        "r": 0,
        "w": 1,
        "ph": "创始人的真实身份",
        "h": "外界和多数成员都不知道的。"
      }
    ]
  }
];

export const ORG_ORDER: string[] = [
  "o_name",
  "o_alias",
  "o_type",
  "o_founded",
  "o_hq",
  "o_scale",
  "o_visibility",
  "o_world",
  "o_creed_line",
  "o_leader",
  "o_power",
  "o_core",
  "o_branches",
  "o_promotion",
  "o_members",
  "o_entry",
  "o_exit",
  "o_belief",
  "o_culture",
  "o_rituals",
  "o_uniform",
  "o_slogan",
  "o_taboo",
  "o_image",
  "o_economy",
  "o_military",
  "o_intel",
  "o_special",
  "o_allies",
  "o_foes",
  "o_territory",
  "o_origin",
  "o_history",
  "o_goal",
  "o_vision",
  "o_conflict",
  "o_threat",
  "o_secret"
];

export const WG: LegacyFieldGroup[] = [
  {
    "t": "基础",
    "tE": "Basic",
    "f": [
      {
        "id": "w_name",
        "l": "名称",
        "lE": "Name",
        "r": 1,
        "ph": "艾瑟兰",
        "h": "世界观的正式名称。"
      },
      {
        "id": "w_alias",
        "l": "别名",
        "lE": "Alias",
        "r": 0,
        "ph": "霜火界、中间界",
        "h": "其他称呼。"
      },
      {
        "id": "w_type",
        "l": "类型",
        "lE": "Type",
        "r": 1,
        "ph": "大陆 / 位面 / 星球",
        "h": "世界的尺度。"
      },
      {
        "id": "w_era",
        "l": "当前纪元",
        "lE": "Era",
        "r": 1,
        "ph": "复兴纪",
        "h": "故事开始的纪元。"
      },
      {
        "id": "w_core",
        "l": "一句话核心概念",
        "lE": "Core Concept",
        "r": 1,
        "w": 1,
        "ph": "魔法正在从世界上消失，而没人知道原因",
        "h": "一句话概括这个世界最独一无二的地方。"
      },
      {
        "id": "w_magic_level",
        "l": "力量强度",
        "lE": "Power Level",
        "r": 0,
        "ph": "低魔 / 中魔 / 高魔",
        "h": "世界中超自然力量的普及度。"
      },
      {
        "id": "w_hardness",
        "l": "设定硬度",
        "lE": "Hardness",
        "r": 0,
        "ph": "硬设定（严格规则）/ 软设定（允许奇迹）",
        "h": "硬设定下，一致性检查会严格；软设定下允许例外。"
      },
      {
        "id": "w_scale",
        "l": "面积 / 规模",
        "lE": "Scale",
        "r": 0,
        "ph": "约相当于三个欧洲",
        "h": "世界的物理规模。"
      },
      {
        "id": "w_population",
        "l": "人口",
        "lE": "Population",
        "r": 0,
        "ph": "约两亿",
        "h": "大致人口。"
      }
    ]
  },
  {
    "t": "自然与地理",
    "tE": "Nature",
    "f": [
      {
        "id": "w_geography",
        "l": "地理概貌",
        "lE": "Geography",
        "r": 0,
        "w": 1,
        "ph": "一望无际的平原、高耸的山脉、终年不化的雪原",
        "h": "整体地形与标志性地貌。"
      },
      {
        "id": "w_climate",
        "l": "气候",
        "lE": "Climate",
        "r": 0,
        "ph": "四季分明，但北方终年冰封",
        "h": "气候与季节。"
      },
      {
        "id": "w_sky",
        "l": "天象",
        "lE": "Sky",
        "r": 0,
        "ph": "双月、极昼、永不落下的红日",
        "h": "日月星辰的异常之处。"
      },
      {
        "id": "w_ecology",
        "l": "生态",
        "lE": "Ecology",
        "r": 0,
        "w": 1,
        "ph": "巨兽与人类共存，森林深处有会说话的树",
        "h": "动植物生态。"
      },
      {
        "id": "w_locations",
        "l": "地点表",
        "lE": "Locations",
        "r": 0,
        "w": 1,
        "ph": "雾谷 | 要塞 | 北境\n翠影森 | 森林 | 中部\n暗流港 | 城市 | 东海岸",
        "h": "每行：「地名 | 类型 | 位置」。其他地方可引用这里的地点名。"
      }
    ]
  },
  {
    "t": "力量体系",
    "tE": "Power System",
    "f": [
      {
        "id": "w_power_system",
        "l": "力量体系",
        "lE": "Power System",
        "r": 0,
        "w": 1,
        "ph": "元素魔法、灵力修炼、契约召唤、血脉觉醒",
        "h": "超自然力量的类型。"
      },
      {
        "id": "w_power_source",
        "l": "能量来源",
        "lE": "Power Source",
        "r": 0,
        "ph": "来自世界树，或来自星辰",
        "h": "力量的根源。"
      },
      {
        "id": "w_power_cost",
        "l": "使用代价",
        "lE": "Power Cost",
        "r": 0,
        "w": 1,
        "ph": "消耗生命力；使用越多，寿命越短",
        "h": "使用能力的代价。"
      },
      {
        "id": "w_power_levels",
        "l": "等级划分",
        "lE": "Power Levels",
        "r": 0,
        "w": 1,
        "ph": "学徒 / 术士 / 大法师 / 贤者",
        "h": "力量的等级划分。"
      },
      {
        "id": "w_power_taboo",
        "l": "禁忌",
        "lE": "Taboo",
        "r": 0,
        "w": 1,
        "ph": "禁止复活死者；禁止契约恶魔",
        "h": "绝对禁止的力量使用。"
      }
    ]
  },
  {
    "t": "社会",
    "tE": "Society",
    "f": [
      {
        "id": "w_races",
        "l": "种族表",
        "lE": "Races",
        "r": 0,
        "w": 1,
        "ph": "人类、精灵、矮人、兽人、龙裔",
        "h": "存在的种族，用「、」分隔。"
      },
      {
        "id": "w_languages",
        "l": "语言表",
        "lE": "Languages",
        "r": 0,
        "w": 1,
        "ph": "通用语、精灵语、龙语、古代语",
        "h": "语言，用「、」分隔。"
      },
      {
        "id": "w_religions",
        "l": "宗教表",
        "lE": "Religions",
        "r": 0,
        "w": 1,
        "ph": "光明神教、自然之灵、祖灵崇拜",
        "h": "宗教，用「、」分隔。"
      },
      {
        "id": "w_politics",
        "l": "政治结构",
        "lE": "Politics",
        "r": 0,
        "w": 1,
        "ph": "多国并立，帝国与城邦共存",
        "h": "政治格局。"
      },
      {
        "id": "w_economy",
        "l": "经济",
        "lE": "Economy",
        "r": 0,
        "ph": "以金币和银币为货币",
        "h": "经济基础。"
      },
      {
        "id": "w_currency",
        "l": "货币",
        "lE": "Currency",
        "r": 0,
        "ph": "1 金币 = 20 银币 = 200 铜币",
        "h": "货币单位。"
      },
      {
        "id": "w_classes",
        "l": "社会阶层",
        "lE": "Classes",
        "r": 0,
        "w": 1,
        "ph": "贵族、平民、奴隶；法师地位特殊",
        "h": "阶层划分。"
      }
    ]
  },
  {
    "t": "历史",
    "tE": "History",
    "f": [
      {
        "id": "w_creation",
        "l": "创世神话",
        "lE": "Creation",
        "r": 0,
        "w": 1,
        "ph": "世界由七位神明用歌声塑造",
        "h": "世界起源的神话或事实。"
      },
      {
        "id": "w_eras",
        "l": "纪元划分",
        "lE": "Eras",
        "r": 0,
        "w": 1,
        "ph": "混沌纪（0-1000）→ 诸神纪（1000-2500）→ 英雄纪（2500-3000）→ 复兴纪（3000-）",
        "h": "每行一个纪元：「名称 | 起止年」。"
      },
      {
        "id": "w_wars",
        "l": "重大战争",
        "lE": "Wars",
        "r": 0,
        "w": 1,
        "ph": "雾谷之战（第三纪元 302 年），死伤十万",
        "h": "影响世界的战争。"
      },
      {
        "id": "w_disasters",
        "l": "灾难",
        "lE": "Disasters",
        "r": 0,
        "w": 1,
        "ph": "大裂谷地震、血月瘟疫、长夜降临",
        "h": "改变世界的灾难。"
      },
      {
        "id": "w_prophecy",
        "l": "预言",
        "lE": "Prophecy",
        "r": 0,
        "w": 1,
        "ph": "「双月同辉之日，旧神将从沉睡中醒来」",
        "h": "流传的预言。"
      }
    ]
  },
  {
    "t": "规则",
    "tE": "Rules",
    "f": [
      {
        "id": "w_death",
        "l": "生死观",
        "lE": "Death",
        "r": 0,
        "ph": "死后灵魂归于世界树",
        "h": "死亡与来世的规则。"
      },
      {
        "id": "w_time",
        "l": "时间流速",
        "lE": "Time",
        "r": 0,
        "ph": "与世界之外的时间一致",
        "h": "时间是否正常流动。"
      },
      {
        "id": "w_cross",
        "l": "跨界方式",
        "lE": "Crossing",
        "r": 0,
        "ph": "通过古老的传送门或禁忌仪式",
        "h": "能否以及如何往返其他世界。"
      },
      {
        "id": "w_uniqueness",
        "l": "独一无二之处",
        "lE": "Uniqueness",
        "r": 0,
        "w": 1,
        "ph": "魔法代价是记忆——每次施法都会忘掉一段过去",
        "h": "这个世界最独特的规则。"
      }
    ]
  },
  {
    "t": "其他",
    "tE": "Extra",
    "f": [
      {
        "id": "w_extra",
        "l": "附",
        "lE": "Extra",
        "r": 0,
        "w": 1,
        "ph": "选填",
        "h": "补充设定。"
      }
    ]
  }
];

export const WORLD_ORDER: string[] = [
  "w_name",
  "w_alias",
  "w_type",
  "w_era",
  "w_core",
  "w_magic_level",
  "w_hardness",
  "w_scale",
  "w_population",
  "w_geography",
  "w_climate",
  "w_sky",
  "w_ecology",
  "w_locations",
  "w_power_system",
  "w_power_source",
  "w_power_cost",
  "w_power_levels",
  "w_power_taboo",
  "w_races",
  "w_languages",
  "w_religions",
  "w_politics",
  "w_economy",
  "w_currency",
  "w_classes",
  "w_creation",
  "w_eras",
  "w_wars",
  "w_disasters",
  "w_prophecy",
  "w_death",
  "w_time",
  "w_cross",
  "w_uniqueness",
  "w_extra"
];

export const DEFAULT_TEMPLATES: Record<string, { name: string; fields: string[] }> = {
  "小说向": {
    "name": "小说向",
    "fields": [
      "姓名",
      "别名",
      "性别",
      "年龄",
      "种族",
      "职业",
      "性格",
      "外貌",
      "背景故事",
      "角色弧光",
      "与主角关系",
      "出场章节",
      "结局"
    ]
  },
  "跑团向": {
    "name": "跑团向",
    "fields": [
      "姓名",
      "种族",
      "职业",
      "等级",
      "力量",
      "敏捷",
      "体质",
      "智力",
      "感知",
      "魅力",
      "技能列表",
      "装备",
      "背景"
    ]
  },
  "同人向": {
    "name": "同人向",
    "fields": [
      "姓名",
      "原作",
      "世界观",
      "性取向",
      "CP倾向",
      "与官配关系",
      "创作标签",
      "简介"
    ]
  },
  "速写向": {
    "name": "速写向",
    "fields": [
      "姓名",
      "一句话简介",
      "三个关键词",
      "标志特征",
      "核心冲突"
    ]
  },
  "约稿向": {
    "name": "约稿向",
    "fields": [
      "姓名",
      "性别",
      "年龄",
      "发色瞳色",
      "服装",
      "标志特征",
      "立绘需求",
      "参考图链接",
      "配色要求"
    ]
  }
};
