export interface ICompetitionRegistration {
  name: string;
  state: string;
  tiktokHandle: string;
  instagramHandle: string;
  videoLink: string;
  auditionCode: string;
  isWinner?: boolean;
  date?: Date;
}

