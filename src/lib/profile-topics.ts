// Core topics every twin must know about, with the improvisation tier from the PRD:
//   locked = the twin may never improvise; ask the real user instead
//   soft   = the twin may give a hedged guess consistent with the profile
//   open   = the twin may improvise freely if it fits the personality

export type Tier = "locked" | "soft" | "open";

export type Topic = {
  key: string;
  label: string;
  question: string;
  tier: Tier;
  options?: string[];
};

export const TOPICS: Topic[] = [
  {
    key: "kids",
    label: "Kids",
    question: "Do you want kids?",
    tier: "locked",
    options: [
      "Want kids",
      "Don't want kids",
      "Have kids, want more",
      "Have kids, don't want more",
      "Not sure yet",
    ],
  },
  {
    key: "religion",
    label: "Religion",
    question: "What role does religion or spirituality play in your life?",
    tier: "locked",
  },
  {
    key: "smoking",
    label: "Smoking",
    question: "Do you smoke?",
    tier: "locked",
    options: ["Never", "Socially", "Regularly", "Trying to quit"],
  },
  {
    key: "relocation",
    label: "Relocation",
    question: "Would you move cities for the right person?",
    tier: "locked",
    options: ["Yes", "Maybe", "No"],
  },
  {
    key: "dealbreakers",
    label: "Dealbreakers",
    question: "What are your dealbreakers? One per line.",
    tier: "locked",
  },
  {
    key: "money",
    label: "Money",
    question: "How do you think about money? Saver or spender, splitting bills, big goals.",
    tier: "soft",
  },
  {
    key: "weekend",
    label: "Weekends",
    question: "What does your ideal weekend look like?",
    tier: "soft",
  },
  {
    key: "politics",
    label: "Politics",
    question: "How important are politics to you in a partner?",
    tier: "soft",
  },
  {
    key: "interests",
    label: "Interests",
    question: "What are your interests and hobbies?",
    tier: "open",
  },
];

export const TOPIC_KEYS = TOPICS.map((t) => t.key);

export const GOALS = [
  { value: "long_term", label: "Long-term relationship" },
  { value: "short_term", label: "Something short-term" },
  { value: "open", label: "Open to either" },
] as const;

export const GENDERS = ["woman", "man", "non-binary"] as const;
