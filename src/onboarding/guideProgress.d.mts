import type {GuideChapterId} from './guideContent';
export declare const GUIDE_VERSION=3;
export type GuideProgress={index:number;seen:boolean;completed:GuideChapterId[]};
export declare function readGuideProgress():GuideProgress;
export declare function hasSeenProductGuide():boolean;
export declare function saveGuideProgress(index:number,seen:boolean,completed?:GuideChapterId[]):void;
export declare function completeGuideChapter(id:GuideChapterId):GuideChapterId[];
