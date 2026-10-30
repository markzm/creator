import assets from '../../public/inspiration/assets.json';

export type InspirationGenre = 'fantasy' | 'scifi' | 'modern';
export type InspirationKind = 'scene' | 'character';
export type InspirationTarget = 'scene' | 'world' | 'char';
export interface InspirationItem {
  id: string;
  title: string;
  enTitle: string;
  kind: InspirationKind;
  genre: InspirationGenre;
  tags: string[];
  description: string;
  questions: [string, string, string];
  seed: string;
  position?: string;
  source: { type: 'generated' | 'photo'; author: string; page?: string; license?: string; model?: string };
}
const original = { type: 'generated', author: 'LoreLab', model: 'gpt-image-2' } as const;
export const genreLabels: Record<InspirationGenre, string> = { fantasy: '奇幻', scifi: '科幻', modern: '现代' };
export const inspirations: InspirationItem[] = [
  { id: 'sky-islands', title: '风停之前，抵达浮岛', enTitle: 'Islands in the quiet sky', kind: 'scene', genre: 'fantasy', tags: ['浮空群岛', '冒险', '远行'],
    description: '晨光穿过浮岛之间的云层。悬桥尽头，一座多年没有亮过的灯塔重新发出信号。',
    questions: ['岛屿靠什么悬浮，又为何开始下沉？', '信号在等待一个人，还是警告所有人？', '邮船上最后一封信，写给谁？'],
    seed: '浮岛每年只在无风的清晨靠近一次。灯塔守望者收到一封来自早已沉没岛屿的信，落款竟是明天的自己。', source: original },
  { id: 'tree-library', title: '古树记得所有名字', enTitle: 'The library that remembers', kind: 'scene', genre: 'fantasy', tags: ['古树图书馆', '秘密', '记忆'],
    description: '书架沿巨树的年轮盘旋，叶片透出温暖的光。一本没有标题的书在空座位前缓缓翻页。',
    questions: ['书中记录的是历史，还是尚未发生的事？', '借走一本书，需要交出什么记忆？', '为什么只有主角看得见那张空椅子？'],
    seed: '古树图书馆借出故事，收回记忆。新来的管理员发现一本尚未写完的传记，而传主正坐在对面读它。', source: original },
  { id: 'orbital-port', title: '下一站，不在星图上', enTitle: 'A port beyond the map', kind: 'scene', genre: 'scifi', tags: ['环轨星港', '探索', '失联'],
    description: '行星弧光照亮环形港口，舷窗外的货船缓慢靠泊。一个被注销的航班突然出现在进港队列。',
    questions: ['失联航班的乘客为何没有衰老？', '港口系统为什么要求隐藏这次靠泊？', '谁会第一个走过登机桥？'],
    seed: '环轨星港接到三十年前失踪航班的请求。飞船上的时钟只走过七分钟，而广播里传来调度员童年的声音。', source: original },
  { id: 'summer-rooftop', title: '把夏天留在天台', enTitle: 'A summer above the city', kind: 'scene', genre: 'modern', tags: ['夏夜天台', '相遇', '治愈'],
    description: '晾衣绳与小灯串之间，城市被晚风吹得安静。两杯还冒着气的茶旁，放着一张没有署名的车票。',
    questions: ['谁在每晚同一个时间点亮灯串？', '车票是告别，还是一场迟来的邀约？', '这个夏天，他们最想留住什么？'],
    seed: '旧公寓即将拆除。两个互不相识的租客约定，在最后一个夏夜到天台交换一件没有对任何人说过的心事。', source: original },
  { id: 'forest-courier', title: '替森林投递秘密的人', enTitle: 'The forest courier', kind: 'character', genre: 'fantasy', tags: ['巡林信使', '坚韧', '承诺'],
    description: '短卷发的成年巡林信使背着旧邮包，披风边缘沾着晨露。她的罗盘从不指向北方，只指向收信人。',
    questions: ['她为何坚持不拆开任何信件？', '最后一个收信人为什么没有名字？', '如果信件会伤害收信人，她还会送达吗？'],
    seed: '她能听见树木记住的地址，却无法找到自己的故乡。一次投递任务要求她把一封信交给“从未出生的人”。', source: original },
  { id: 'starship-mechanic', title: '修好飞船，也修好明天', enTitle: 'The starship mechanic', kind: 'character', genre: 'scifi', tags: ['星舰修理师', '可靠', '流浪'],
    description: '宽肩的成年修理师把工具收进磨旧的工作服。义肢上的手写刻度记录着每一次成功返航。',
    questions: ['他为何只修即将报废的飞船？', '那条永远不换的零件属于谁？', '他能否修好一艘不愿离港的船？'],
    seed: '他在边境港口修理没人要的飞船，却拒绝登上任何一艘。直到某天，一台旧导航器喊出了他失踪女儿的名字。', source: original },
  { id: 'android-archivist', title: '被允许遗忘的档案员', enTitle: 'The android archivist', kind: 'character', genre: 'scifi', tags: ['仿生档案员', '身份', '选择'],
    description: '中性外形的成年仿生档案员站在资料柜之间。温柔的目光下，一条细小的机械接缝延伸到衣领。',
    questions: ['完美记忆为什么出现一段空白？', '档案员是在保存真相，还是维护某个谎言？', '第一次主动删除记忆，会选择什么？'],
    seed: '负责保存城市记忆的仿生档案员发现，每年都有同一天被统一删除。今年，它偷偷留下了那一天的一张照片。', source: original },
  { id: 'midnight-host', title: '在凌晨两点，听见你', enTitle: 'The midnight radio host', kind: 'character', genre: 'modern', tags: ['深夜电台主持', '倾听', '重逢'],
    description: '一位成年电台主持人戴着耳机，手边放着温热的茶。窗外城市入睡，接听指示灯仍然亮着。',
    questions: ['为什么她只接受匿名来电？', '谁每晚点播同一首歌，却从不说话？', '当听众开始询问她的故事，她会回答吗？'],
    seed: '她主持一档几乎无人收听的深夜节目。某晚，一个陌生听众准确说出了她明天会遇到的人，却只想请她替自己道歉。', source: original },
  { id: 'mist-forest', title: '雾散之前，别回头', enTitle: 'Before the mist clears', kind: 'scene', genre: 'fantasy', tags: ['雾林', '迷途', '静谧'],
    description: '层层针叶林消失在灰白的雾里。道路没有尽头，远处却传来熟悉的木门声。',
    questions: ['雾中回声属于谁？', '森林是否会移动？', '主角愿意用什么换取一条归途？'],
    seed: '雾林只会向迷路的人显现。每隔百步便有一扇门，每扇门后都是旅人曾经放弃的一种人生。',
    source: { type: 'photo', author: 'Adam Porter', page: 'https://unsplash.com/photos/forest-covered-fog-during-daytime-iIK81QhpntA', license: 'https://unsplash.com/license' } },
  { id: 'neon-street', title: '霓虹熄灭后的街道', enTitle: 'After the neon fades', kind: 'scene', genre: 'scifi', tags: ['霓虹街道', '赛博', '追踪'],
    description: '雨水映出深蓝与红色灯光，狭窄街道里的招牌逐一熄灭。最后一盏灯下，有人正在等一段交易。',
    questions: ['这座城的夜晚由谁控制？', '追踪者为什么留下了自己的坐标？', '那场交易会改变什么记忆？'],
    seed: '城市每天凌晨会断网三分钟。一个记忆修复师发现，只有在这三分钟里，街对面那家不存在的店才会开门。',
    source: { type: 'photo', author: 'Allen Boguslavsky', page: 'https://unsplash.com/photos/a-city-street-at-night-with-a-neon-sign-y93fRKcMIZk', license: 'https://unsplash.com/license' } },
  { id: 'misty-station', title: '有人在等最后一班车', enTitle: 'The last train home', kind: 'scene', genre: 'modern', tags: ['雾中车站', '悬念', '旅途'],
    description: '清晨的薄雾遮住站台尽头，铁轨向远处延伸。空荡的候车区里，一把伞仍在滴水。',
    questions: ['谁把伞留在这里？', '末班车为什么总会多停一分钟？', '两名乘客是否在等待同一个人？'],
    seed: '小站即将停运。最后一班车到站前，一位陌生人递给站务员一张二十年前的车票，请求替一个人完成告别。',
    source: { type: 'photo', author: 'Edwin Flores', page: 'https://www.pexels.com/photo/foggy-train-station-platform-on-a-misty-morning-28888431/', license: 'https://www.pexels.com/license/' } },
  { id: 'coastal-light', title: '给远行者留一盏灯', enTitle: 'A light for the returning', kind: 'scene', genre: 'modern', tags: ['海岸灯塔', '守望', '归来'],
    description: '海浪撞上岩岸，孤独的灯塔守着深蓝色的海。一个邮包被潮水推上通往灯塔的小路。',
    questions: ['守塔人为什么从未离开？', '邮包经历了多久的漂流？', '谁会在风暴之后归来？'],
    seed: '退休的守塔人每周都收到一封没有寄件地址的信。新的信里没有文字，只有一张从灯塔内部拍摄的照片。',
    source: { type: 'photo', author: 'Brittany Anger', page: 'https://unsplash.com/photos/lighthouse-on-a-rocky-coast-with-waves-crashing-YrfCloTrZlA', license: 'https://unsplash.com/license' } }
];
type AssetInfo = { width: number; height: number; bytes: number };
export function inspirationAsset(id: string, variant: 'thumb' | 'detail' = 'thumb') {
  const key = `${id}-${variant}.webp`;
  const info = (assets as Record<string, AssetInfo>)[key];
  return info ? { src: `/inspiration/${key}`, ...info } : undefined;
}
export const getInspiration = (id?: string) => inspirations.find(item => item.id === id);
export const inspirationSourceLabel = (item: InspirationItem) => item.source.type === 'photo' ? '摄影参考' : inspirationAsset(item.id) ? 'AI 原创插画' : '文字灵感';
export function filterInspirations(query: string, genre: string, kind: string) {
  const q = query.trim().toLocaleLowerCase();
  return inspirations.filter(item => (!genre || item.genre === genre) && (!kind || item.kind === kind) &&
    (!q || [item.title, item.enTitle, item.description, ...item.tags].join(' ').toLocaleLowerCase().includes(q)))
    .sort((a, b) => Number(Boolean(inspirationAsset(b.id))) - Number(Boolean(inspirationAsset(a.id))));
}
