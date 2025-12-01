export type DatasetCategory =
  | "computer-vision"
  | "natural-language"
  | "speech-audio"
  | "healthcare"
  | "robotics"
  | "other";

export type DataType = "image" | "video" | "audio" | "text" | "mixed";

export type DatasetStatus = "active" | "closing-soon" | "completed" | "paused";

export interface Organization {
  id: string;
  name: string;
  avatar?: string;
  verified: boolean;
}

export interface Dataset {
  id: string;
  title: string;
  description: string;
  category: DatasetCategory;
  dataType: DataType;
  status: DatasetStatus;
  organization: Organization;
  samplesNeeded: number;
  samplesCollected: number;
  rewardAmount: number;
  currency: string;
  activeContributors: number;
  deadline: string;
  datePosted: string;
  qualityCriteria: string[];
  requirements: string[];
  paidAmount?: number;
  totalBudget?: number;
  paymentStatus?: "unpaid" | "partial" | "paid" | "refunded";
  featured?: boolean;
  imageUrl: string;
}

export interface DatasetFilters {
  search: string;
  categories: DatasetCategory[];
  dataTypes: DataType[];
  rewardRange: [number, number];
  status: DatasetStatus[];
}

export type SortOption =
  | "newest"
  | "oldest"
  | "highest-reward"
  | "lowest-reward"
  | "most-popular"
  | "closing-soon";
