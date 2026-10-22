// Core topics every twin must know about, with the improvisation tier from the PRD:
//   locked = the twin may never improvise; ask the real user instead
//   soft   = the twin may give a hedged guess consistent with the profile
//   open   = the twin may improvise freely if it fits the personality

export type Tier = "locked" | "soft" | "open";

// Every topic is answered on the profile form. Topics with options are multiple
// choice with an "Other" write-in and must be answered ("Prefer not to say" counts).
// Topics without options are free response, and the user may skip them for now.
export type Topic = {
  key: string;
  label: string;
  question: string;
  tier: Tier;
  options?: string[];
  placeholder?: string;
};

export const PREFER_NOT_TO_SAY = "Prefer not to say";

// Form value for the "Other" choice; its text comes from topic_<key>_other.
export const OTHER = "__other__";

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
      "Open to kids",
      "Not sure yet",
      PREFER_NOT_TO_SAY,
    ],
  },
  {
    key: "religion",
    label: "Religion",
    question: "What role does religion or spirituality play in your life?",
    tier: "locked",
    options: [
      "Not religious",
      "Spiritual, not religious",
      "Religious, not very practicing",
      "Religious and practicing",
      "My partner must share my faith",
      PREFER_NOT_TO_SAY,
    ],
  },
  {
    key: "smoking",
    label: "Smoking",
    question: "Do you smoke?",
    tier: "locked",
    options: ["Never", "Socially", "Regularly", "Trying to quit", PREFER_NOT_TO_SAY],
  },
  {
    key: "drinking",
    label: "Drinking",
    question: "Do you drink?",
    tier: "locked",
    options: ["Never", "Rarely", "Socially", "Regularly", "Sober", PREFER_NOT_TO_SAY],
  },
  {
    key: "drugs",
    label: "Drugs",
    question: "Do you use recreational drugs, including weed?",
    tier: "locked",
    options: ["Never", "Weed only, sometimes", "Sometimes", "Regularly", PREFER_NOT_TO_SAY],
  },
  {
    key: "relocation",
    label: "Relocation",
    question: "Would you move cities for the right person?",
    tier: "locked",
    options: ["Yes", "Maybe", "No", PREFER_NOT_TO_SAY],
  },
  {
    key: "dealbreakers",
    label: "Dealbreakers",
    question: "What are your dealbreakers or red flags in a partner? One per line.",
    tier: "locked",
    placeholder: "e.g. Smokes\nDoesn't want kids",
  },
  {
    key: "pets",
    label: "Pets",
    question: "How do you feel about pets?",
    tier: "soft",
    options: [
      "Have pets and love them",
      "Want pets someday",
      "Like pets, don't want my own",
      "Not a pet person",
      "Allergic",
      PREFER_NOT_TO_SAY,
    ],
  },
  {
    key: "money",
    label: "Money",
    question: "How do you think about money?",
    tier: "soft",
    options: [
      "Careful saver",
      "Balanced saver and spender",
      "Spend on experiences",
      "Spend freely, enjoy it now",
      PREFER_NOT_TO_SAY,
    ],
  },
  {
    key: "weekend",
    label: "Weekends",
    question: "What does your ideal weekend look like?",
    tier: "soft",
    options: [
      "Out with friends",
      "Mix of going out and resting",
      "Quiet at home",
      "Outdoors and active",
      "Different every week",
    ],
  },
  {
    key: "politics",
    label: "Politics",
    question: "How important are politics to you in a partner?",
    tier: "soft",
    options: [
      "Very important, we must agree",
      "Somewhat important",
      "Not important",
      PREFER_NOT_TO_SAY,
    ],
  },
  {
    key: "interests",
    label: "Interests",
    question: "What are your interests and hobbies?",
    tier: "open",
    placeholder: "e.g. climbing, cooking for friends, horror movies",
  },
];

export const TOPIC_KEYS = TOPICS.map((t) => t.key);

export const GOALS = [
  { value: "long_term", label: "Long-term relationship" },
  { value: "short_term", label: "Something short-term" },
  { value: "open", label: "Open to either" },
] as const;

// Gender: one of these, or the person's own words (e.g. "genderfluid"), stored
// as typed. For matching, anything other than woman or man counts as non-binary.
export const GENDERS = ["woman", "man", "non-binary"] as const;
export const GENDER_LABELS: Record<(typeof GENDERS)[number], string> = {
  woman: "Woman",
  man: "Man",
  "non-binary": "Non-binary",
};

// Interested in: any mix of the three groups, or everyone (every gender,
// including people who describe theirs in their own words).
export const EVERYONE = "everyone";
export const SEEKING = [...GENDERS, EVERYONE] as const;
export const SEEKING_LABELS: Record<(typeof SEEKING)[number], string> = {
  woman: "Women",
  man: "Men",
  "non-binary": "Non-binary people",
  everyone: "Everyone",
};

export const genderGroup = (gender: string) => (gender === "woman" || gender === "man" ? gender : "non-binary");

// Whether someone with this "interested in" list wants to meet this gender.
// Choosing only "man" means men only; "everyone" means anyone.
export const isInterestedIn = (seeking: string[], gender: string) =>
  seeking.includes(EVERYONE) || seeking.includes(genderGroup(gender));
