export const testBrokers = [
  { id: "test-broker-root", userId: "190000000000000001", nickname: "测试-小肉", phone: "18800000001", level: "SEED", phase: 1, joinedAt: "2026-04-01T00:00:00", qualifiedAt: "2026-04-01T00:00:00", unlocked: true },
  { id: "test-broker-ming", userId: "190000000000000002", nickname: "测试-小明待晋升", phone: "18800000002", level: "NORMAL", phase: 1, joinedAt: "2026-07-01T10:00:00", qualifiedAt: null, unlocked: false },
  { id: "test-broker-hua", userId: "190000000000000003", nickname: "测试-小华已晋升", phone: "18800000003", level: "SEED", phase: 1, joinedAt: "2026-06-20T09:00:00", qualifiedAt: "2026-07-08T12:00:00", unlocked: true },
  { id: "test-broker-zhou", userId: "190000000000000004", nickname: "测试-小周二级下线", phone: "18800000004", level: "NORMAL", phase: 1, joinedAt: "2026-07-10T09:30:00", qualifiedAt: null, unlocked: false },
  { id: "test-broker-seed2", userId: "190000000000000005", nickname: "测试-第二期种子", phone: "18800000005", level: "SEED", phase: 2, joinedAt: "2026-06-01T00:00:00", qualifiedAt: "2026-06-01T00:00:00", unlocked: true },
  { id: "test-broker-plain", userId: "190000000000000006", nickname: "测试-无身份经纪人", phone: "18800000006", level: "NORMAL", phase: null, joinedAt: null, qualifiedAt: null, unlocked: false }
] as const;

export const testSigners = [
  { id: "test-signer-a", userId: "195000000000000001", nickname: "测试模特-安然", phone: "17700000001", gender: "女", age: 25, birthDate: "2001-03-18", region: "上海市徐汇区", height: 168, weight: 49, sizes: [82, 62, 88, 39], shoe: "38", clothing: "S", tattoo: "无", hairColor: "黑色", hairLength: "长发", languages: "普通话、英语", bio: "测试资料：擅长平面拍摄、商业活动和生活方式短视频。" },
  { id: "test-signer-b", userId: "195000000000000002", nickname: "测试模特-北辰", phone: "17700000002", gender: "男", age: 28, birthDate: "1998-08-12", region: "上海市静安区", height: 182, weight: 70, sizes: [96, 78, 96, 46], shoe: "43", clothing: "L", tattoo: "无", hairColor: "黑色", hairLength: "短发", languages: "普通话", bio: "测试资料：具有会展礼仪、运动品牌和商务拍摄经验。" },
  { id: "test-signer-c", userId: "195000000000000003", nickname: "测试模特-初夏", phone: "17700000003", gender: "女", age: 23, birthDate: "2003-05-09", region: "浙江省杭州市", height: 172, weight: 52, sizes: [84, 63, 89, 40], shoe: "39", clothing: "M", tattoo: "脚踝小面积", hairColor: "深棕色", hairLength: "中长发", languages: "普通话、英语", bio: "测试资料：适合时装、电商和品牌快闪活动。" },
  { id: "test-signer-d", userId: "195000000000000004", nickname: "测试模特-冬青", phone: "17700000004", gender: "男", age: 31, birthDate: "1995-11-20", region: "江苏省南京市", height: 185, weight: 76, sizes: [100, 82, 98, 47], shoe: "44", clothing: "XL", tattoo: "无", hairColor: "黑色", hairLength: "短发", languages: "普通话、英语", bio: "测试资料：商务形象稳定，可配合跨城活动。" },
  { id: "test-signer-e", userId: "195000000000000005", nickname: "测试模特-沐晴", phone: "17700000005", gender: "女", age: 27, birthDate: "1999-01-06", region: "上海市普陀区", height: 165, weight: 47, sizes: [80, 60, 86, 38], shoe: "37", clothing: "S", tattoo: "无", hairColor: "黑色", hairLength: "长发", languages: "普通话、日语", bio: "测试资料：擅长美妆、手模和直播展示。" },
  { id: "test-signer-f", userId: "195000000000000006", nickname: "测试模特-远山", phone: "17700000006", gender: "男", age: 26, birthDate: "2000-06-15", region: "浙江省宁波市", height: 180, weight: 68, sizes: [94, 76, 95, 45], shoe: "42", clothing: "L", tattoo: "手臂小面积", hairColor: "黑色", hairLength: "短发", languages: "普通话", bio: "测试资料：运动、户外和潮流服饰拍摄。" }
] as const;

type ReviewStatus = "APPROVED" | "PENDING" | "REJECTED";

export type TestBriefing = {
  id: string;
  brokerId: string;
  title: string;
  publishedAt: string;
  workDate: string;
  workTime?: string;
  sourceStatus?: string;
  cancelReason?: string;
  publishReview: ReviewStatus;
  completeReview: ReviewStatus;
  signers?: string[];
  evidence?: boolean;
};

const b = (id: number, brokerId: string, title: string, publishedAt: string, workDate: string, publishReview: ReviewStatus, completeReview: ReviewStatus, signers: string[] = [], extra: Partial<TestBriefing> = {}): TestBriefing => ({
  id: `test-briefing-${String(id).padStart(2, "0")}`,
  brokerId,
  title: `测试-${title}`,
  publishedAt,
  workDate,
  publishReview,
  completeReview,
  signers,
  workTime: "14:00 ~ 20:00",
  sourceStatus: "已结束",
  ...extra
});

export const testBriefings: TestBriefing[] = [
  b(1, "test-broker-root", "根种子品牌快闪", "2026-07-01T09:00:00", "2026-07-02", "APPROVED", "APPROVED", ["test-signer-a"], { evidence: true }),
  b(2, "test-broker-root", "根种子商场巡展", "2026-07-03T10:00:00", "2026-07-04", "APPROVED", "PENDING"),
  b(3, "test-broker-root", "根种子发布会礼仪", "2026-07-09T11:00:00", "2026-07-10", "APPROVED", "APPROVED", ["test-signer-b"]),
  b(4, "test-broker-root", "进行中长期展台", "2026-07-12T12:00:00", "2026-07-18", "PENDING", "PENDING", [], { sourceStatus: "进行中" }),

  b(5, "test-broker-ming", "小明达标01", "2026-07-01T10:30:00", "2026-07-02", "APPROVED", "APPROVED", ["test-signer-a"], { evidence: true }),
  b(6, "test-broker-ming", "小明达标02", "2026-07-01T14:00:00", "2026-07-02", "APPROVED", "PENDING"),
  b(7, "test-broker-ming", "小明达标03", "2026-07-02T09:00:00", "2026-07-03", "APPROVED", "APPROVED", ["test-signer-b"]),
  b(8, "test-broker-ming", "小明达标04", "2026-07-03T09:00:00", "2026-07-04", "APPROVED", "PENDING"),
  b(9, "test-broker-ming", "小明达标05", "2026-07-04T09:00:00", "2026-07-05", "APPROVED", "PENDING"),
  b(10, "test-broker-ming", "小明达标06", "2026-07-05T09:00:00", "2026-07-06", "APPROVED", "PENDING"),
  b(11, "test-broker-ming", "小明候选待审核", "2026-07-06T09:00:00", "2026-07-07", "PENDING", "PENDING"),
  b(12, "test-broker-ming", "小明来源取消", "2026-07-07T09:00:00", "2026-07-07", "REJECTED", "REJECTED", [], { sourceStatus: "已取消", cancelReason: "系统自动取消：无有效签约" }),

  b(13, "test-broker-hua", "小华晋升前01", "2026-06-22T09:00:00", "2026-06-23", "APPROVED", "APPROVED", ["test-signer-c"]),
  b(14, "test-broker-hua", "小华晋升前02", "2026-06-24T09:00:00", "2026-06-25", "APPROVED", "APPROVED", ["test-signer-d"]),
  b(15, "test-broker-hua", "小华晋升前03", "2026-06-26T09:00:00", "2026-06-27", "APPROVED", "PENDING"),
  b(16, "test-broker-hua", "小华晋升前04", "2026-06-28T09:00:00", "2026-06-29", "APPROVED", "PENDING"),
  b(17, "test-broker-hua", "小华晋升前05", "2026-07-02T09:00:00", "2026-07-03", "APPROVED", "PENDING"),
  b(18, "test-broker-hua", "小华晋升前06", "2026-07-05T09:00:00", "2026-07-06", "APPROVED", "PENDING"),
  b(19, "test-broker-hua", "小华晋升后新签", "2026-07-08T13:00:00", "2026-07-09", "APPROVED", "APPROVED", ["test-signer-c"], { evidence: true }),
  b(20, "test-broker-hua", "小华晋升后重复", "2026-07-09T13:00:00", "2026-07-10", "APPROVED", "REJECTED", ["test-signer-c"]),
  b(21, "test-broker-hua", "小华晋升后第二新签", "2026-07-10T13:00:00", "2026-07-11", "APPROVED", "APPROVED", ["test-signer-e"]),
  b(22, "test-broker-hua", "小华凭证异议", "2026-07-11T13:00:00", "2026-07-12", "PENDING", "PENDING", [], { evidence: true }),

  b(23, "test-broker-zhou", "二级下线计划通告", "2026-07-10T10:00:00", "2026-07-11", "APPROVED", "APPROVED", ["test-signer-f"]),
  b(24, "test-broker-zhou", "二级下线待审核", "2026-07-11T10:00:00", "2026-07-12", "PENDING", "PENDING"),
  b(25, "test-broker-zhou", "二级下线资料不符", "2026-07-12T10:00:00", "2026-07-13", "APPROVED", "REJECTED", ["test-signer-e"]),

  b(26, "test-broker-seed2", "第二期正常奖励", "2026-07-08T09:00:00", "2026-07-09", "APPROVED", "APPROVED", ["test-signer-b"]),
  b(27, "test-broker-seed2", "第二期举报取消", "2026-07-09T09:00:00", "2026-07-10", "REJECTED", "REJECTED", [], { sourceStatus: "举报取消", cancelReason: "测试举报成立" }),

  b(28, "test-broker-plain", "无身份历史通告", "2026-06-15T09:00:00", "2026-06-16", "PENDING", "PENDING"),
  b(29, "test-broker-plain", "无身份进行中通告", "2026-07-10T09:00:00", "2026-07-15", "PENDING", "PENDING", [], { sourceStatus: "进行中" })
];
