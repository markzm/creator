import type { DocV6 } from './schema/types';
import { createEmptyDocV6 } from './schema/migrations';

export function createStarterExampleDoc(): DocV6 {
  const doc = createEmptyDocV6();
  const now = Date.now();

  const wId = 'wd_astral';
  const oId = 'og_astrolabe';
  const c1Id = 'ch_linxi';
  const c2Id = 'ch_whiteclaw';
  const artId = 'art_sample1';

  doc.worlds = {
    [wId]: {
      id: wId,
      name: '星渊群岛',
      customInsp: ['以太洋流', '蒸汽飞空艇', '星核裂隙', '遗忘巨像', '失落星图'],
      visibility: 'public',
      createdAt: now,
      updatedAt: now,
      data: {
        w_name: '星渊群岛',
        w_alias: '以太之海、浮空断界',
        w_type: '破碎浮空群岛',
        w_era: '星历 412 年 · 雾海探索纪元',
        w_core: '由无数悬浮在星能以太海洋上的浮空岛屿构成，文明依靠蒸汽动力与星轨以太晶石驱动空天飞艇穿行。',
        w_magic_level: '中高魔 · 星界法则与蒸汽工业并存',
        w_hardness: '硬设定与软奇幻平衡',
        w_scale: '已探测浮空群岛 300 余座，跨越数万星里',
        w_population: '各族定居人口约 8000 万',
        w_power_system: '星界共鸣法与以太蒸汽动力学。通过铭刻以太符文回路，操控微重力与聚能等离子。',
        w_power_cost: '长期过度共鸣会导致星蚀结晶化（肢体出现星斑），必须定期浸泡纯净海盐以太溶液消退。',
        w_locations: '浮空巨塔阿斯托利亚、深渊回音裂谷、云海哨站「海鸥之翼」'
      }
    }
  };

  doc.orgs = {
    [oId]: {
      id: oId,
      name: '观星塔学会',
      visibility: 'public',
      createdAt: now,
      updatedAt: now,
      data: {
        o_name: '观星塔学会',
        o_alias: '星轨巡者、阿斯托利亚观测评议会',
        o_type: '跨岛屿学术与探索科研组织',
        o_world: '星渊群岛',
        o_hq: '中央浮岛 · 阿斯托利亚观星巨塔',
        o_creed_line: '「以理性丈量以太，以星轨指引归航。」',
        o_leader: '大星导师 埃莱诺·凡尔纳',
        o_core: '负责绘制浮空群岛漂移动态星图，监管以太裂隙能量安全，派遣探索船搜寻史前遗迹。',
        o_slogan: '星海未曾隐匿，只是静待观测。',
        o_uniform: '深蓝呢绒长风衣，饰以银白黄铜星轨测量仪扣针与皮质观测镜手套。'
      }
    }
  };

  doc.chars = {
    [c1Id]: {
      id: c1Id,
      name: '林汐',
      visibility: 'public',
      createdAt: now,
      updatedAt: now,
      data: {
        name: '林汐',
        alias: '星轨测绘员、小汐',
        gender: '女',
        age: '17岁',
        race: '人类（带微量星灵血脉）',
        job: '观星塔学会 见习星图测绘员',
        identity: '阿斯托利亚第三席研究员之女 / 「破晓号」随船记录官',
        morality: '中立善良',
        personality: '敏锐专注、好奇心极强，面对未知危险沉着冷静，但在社交寒暄时容易局促脸红。',
        feature: '耳垂戴着单只黄铜星象齿轮吊坠，深栗色短发中隐现几缕银白色星辉挑染。',
        clothes: '浅灰防水工装衬衫，藏青防风短斗篷，腰间挂着多功能星规罗盘与皮面速记本。',
        power: '微光星轨感知：能以肉眼捕捉到以太洋流中微弱的引力湍流，预知空难气旋。',
        power_cost: '使用超过半小时会产生轻微头晕与视错觉。',
        world: '星渊群岛',
        orgs: '观星塔学会 | 见习测绘员 | 410- | 在职',
        dream: '补全母亲未完成的《大以太洋外缘全境星图》。',
        relations: '怀特·克劳|忘年交、保护者|信赖的长辈与可靠的飞艇船长'
      }
    },
    [c2Id]: {
      id: c2Id,
      name: '怀特·克劳',
      visibility: 'public',
      createdAt: now,
      updatedAt: now,
      data: {
        name: '怀特·克劳',
        alias: '独眼克劳、破晓号老爹',
        gender: '男',
        age: '46岁',
        race: '人类',
        job: '探险飞艇「破晓号」船长',
        identity: '退役以太巡防舰队少校 / 独立探险商船协会元老',
        morality: '混乱善良',
        personality: '豪爽幽默，嗜浓咖啡与机械机油气味，极度护短，关键时刻有老兵的铁血手腕。',
        feature: '右眼戴着机械光学校正义眼，左颊一道被以太飞刃划过的浅伤痕。',
        clothes: '磨损发亮的皮革飞行夹克，厚铜扣帆布工装裤，钢头航海皮靴。',
        power: '机械直觉与重力舵术：能盲操三阶以太增压蒸汽引擎，极限突破浮空逆风带。',
        weapon: '重型改装以太手炮「雷鸣三型」',
        world: '星渊群岛',
        dream: '将破晓号开入传说中永不坠落的「原初星界核心」。',
        relations: '林汐|监护对象、随船记录员|答应过她父亲照顾好她'
      }
    }
  };

  doc.articles = [
    {
      id: artId,
      title: '《星渊航志·序章：雾海灯塔》',
      category: '小说正文',
      summary: '破晓号飞艇穿越以太浓雾带，年轻的测绘员林汐首次感知到异常的星轨扰动，指引飞艇驶向一座不该存在的浮空灯塔。',
      content: `以太浓雾沉甸甸地压在「破晓号」的青铜装甲外壳上，泛起阵阵幽蓝色的微光涟漪。

蒸汽管道在脚底的甲板深处低沉轰鸣，带来令人心安的微颤。林汐趴在右舷的观测台前，指尖轻轻旋动铜制星象测绘仪的游标刻度。寒夜的雾气渗过指缝，带来微咸的金属气味。

「小汐，还有半小时到第三哨站，把目镜收一收，回舱里喝口热可可。」
沉重的皮靴声停在身后，怀特·克劳船长的大手拍在舷梯扶手上。他右眼的机械光学校准镜在幽蓝薄雾里闪烁着柔和的橙红光点，雪茄的烟草味混合着浓烈的机油气息弥散开来。

「船长，你看这个偏角。」林汐没有回头，她的声音很轻，却带着一种压抑不住的急促，「观星塔学会的星图上，这一带是完全没有锚定陆块的空海——但过去十分钟里，我的星轨感知器连续三次感应到了稳定的微重力脉冲。」

怀特脸上的调侃神色微微一敛。作为在以太洋流里浮沉了二十年的老水手，他深知在浮空断界里，任何未登记的重力脉冲只有两种可能：要么是足以撕裂龙骨的以太暗礁，要么就是——

「全舰一级警戒，压低二号升力气囊！」怀特猛地转身切断了主蒸汽阀，声音洪亮地撞碎了浓雾。

正前方的浓稠雾海，在狂风的撕扯下骤然向两侧崩解。一座通体由青黑色黑曜石垒砌、高达数百米的古老灯塔，在虚无的星渊深处悄然浮现。塔顶没有明火，只有一团正在缓缓旋转的苍白色星云。`,
      worldId: wId,
      orgIds: [oId],
      charIds: [c1Id, c2Id],
      visibility: 'public',
      wordCount: 685,
      createdAt: now,
      updatedAt: now
    }
  ];

  doc.plots = [
    {
      id: 'pl_vol1',
      title: '第一卷 · 雾海灯塔之谜',
      note: '讲述破晓号发现失落以太灯塔，引来多方势力追逐的冒险。',
      acts: [
        {
          id: 'at_act1',
          title: '第一幕 · 异常航道',
          chapters: [
            {
              id: 'chp_1',
              title: '雾海灯塔',
              status: '已完成',
              year: '星历412年',
              summary: '破晓号偶遇未登记的浮空灯塔，林汐测出异常星轨读数。',
              updatedAt: now
            }
          ]
        }
      ],
      updatedAt: now
    }
  ];

  doc.preferences = {
    preferredGenre: '奇幻架空 / 蒸汽朋克',
    writingTone: '细腻生动、富有画面感与探险张力',
    defaultPerspective: '第三人称有限视角',
    aiCustomInstruction: '注重感官描写（声音、气味、光影），突出角色性格互动与工业机械与奇幻魔法的交融。'
  };

  doc.ui = {
    activeW: wId,
    activeO: oId,
    activeC: c1Id,
    activeTpl: '',
    activeArticle: artId,
    nowYear: 412
  };

  return doc;
}
