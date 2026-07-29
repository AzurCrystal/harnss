export type TimeBucket = "lateNight" | "morning" | "afternoon" | "evening";

export interface ContinueMessage {
  headline: string;
  subtitle: string;
  accent: string;
}

const ANYTIME_CONTINUE_MESSAGES: readonly ContinueMessage[] = [
  {
    headline: "继续开发",
    subtitle: "你的会话都已准备好，选一个继续推进。",
    accent: "oklch(0.62 0.18 185)",
  },
  {
    headline: "欢迎回来",
    subtitle: "仓库已经想你几秒钟了。",
    accent: "oklch(0.66 0.16 32)",
  },
  {
    headline: "又开始了，捣蛋鬼",
    subtitle: "选个会话，优雅地制造点混乱。",
    accent: "oklch(0.7 0.17 145)",
  },
  {
    headline: "再改一个小地方",
    subtitle: "经典的最后一句话。你的会话在等你。",
    accent: "oklch(0.72 0.14 260)",
  },
];

const TIME_AWARE_CONTINUE_MESSAGES: Record<TimeBucket, readonly ContinueMessage[]> = {
  lateNight: [
    {
      headline: "你好，夜猫子",
      subtitle: "最棒的点子和最糟的提交信息，往往都在此刻出现。",
      accent: "oklch(0.7 0.15 250)",
    },
    {
      headline: "午夜调试俱乐部",
      subtitle: "堆栈跟踪正在黑暗中微微发光。",
      accent: "oklch(0.68 0.18 290)",
    },
    {
      headline: "月光下等待合并",
      subtitle: "趁鸟儿还没开始上班，从上次停下的地方继续。",
      accent: "oklch(0.74 0.13 215)",
    },
  ],
  morning: [
    {
      headline: "早上好，开发者",
      subtitle: "新标签页、新咖啡，还是那张长长的 TODO 清单。",
      accent: "oklch(0.76 0.16 78)",
    },
    {
      headline: "起床，重构",
      subtitle: "你的会话比一些队友醒得还早。",
      accent: "oklch(0.73 0.17 110)",
    },
    {
      headline: "清晨提交能量",
      subtitle: "趁会议找上门前，先拿下一个轻松的胜利。",
      accent: "oklch(0.78 0.15 48)",
    },
  ],
  afternoon: [
    {
      headline: "欢迎回来，阳光正好",
      subtitle: "正是把半成品点子变成功能的黄金时段。",
      accent: "oklch(0.74 0.18 58)",
    },
    {
      headline: "午后冲刺模式",
      subtitle: "代码正热，会话也已排好队。",
      accent: "oklch(0.68 0.19 28)",
    },
    {
      headline: "午后补丁突袭",
      subtitle: "选个会话，让路线图更可信。",
      accent: "oklch(0.75 0.16 135)",
    },
  ],
  evening: [
    {
      headline: "晚班已开始",
      subtitle: "安静时段，专注力满格，带点小怪兽能量。",
      accent: "oklch(0.67 0.17 15)",
    },
    {
      headline: "暮色构建时光",
      subtitle: "适合发布一些聪明却没必要的东西。",
      accent: "oklch(0.69 0.18 335)",
    },
    {
      headline: "加班后欢迎回来",
      subtitle: "你的会话已准备好，等你来做一次绝对很快的查看。",
      accent: "oklch(0.72 0.15 210)",
    },
  ],
};

function getTimeBucket(date: Date): TimeBucket {
  const hour = date.getHours();
  if (hour < 5) {
    return "lateNight";
  }
  if (hour < 12) {
    return "morning";
  }
  if (hour < 18) {
    return "afternoon";
  }
  return "evening";
}

function pickRandomMessage(
  messages: readonly ContinueMessage[],
  previous?: ContinueMessage,
): ContinueMessage {
  if (messages.length === 1) {
    return messages[0];
  }

  let nextMessage = messages[Math.floor(Math.random() * messages.length)];
  if (!previous) {
    return nextMessage;
  }

  let attempts = 0;
  while (
    attempts < 6 &&
    nextMessage.headline === previous.headline &&
    nextMessage.subtitle === previous.subtitle
  ) {
    nextMessage = messages[Math.floor(Math.random() * messages.length)];
    attempts += 1;
  }

  return nextMessage;
}

function getContinueMessageHourKey(date: Date): string {
  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
  ].join(":");
}

export function getContinueMessage(
  previous?: ContinueMessage,
  now: Date = new Date(),
): ContinueMessage {
  const bucket = getTimeBucket(now);
  return pickRandomMessage(
    [...TIME_AWARE_CONTINUE_MESSAGES[bucket], ...ANYTIME_CONTINUE_MESSAGES],
    previous,
  );
}

export function getNextContinueMessageDelay(now: Date = new Date()): number {
  const nextHour = new Date(now);
  nextHour.setHours(now.getHours() + 1, 0, 0, 0);
  return Math.max(nextHour.getTime() - now.getTime(), 60_000);
}

export function shouldRefreshContinueMessage(
  lastRefreshedAt: Date,
  now: Date = new Date(),
): boolean {
  return getContinueMessageHourKey(lastRefreshedAt) !== getContinueMessageHourKey(now);
}
