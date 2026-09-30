/** Authored scene times stay unchanged; every animated surface reads this timeline. */
export const FILM_PLAYBACK_RATE = 1.6;
export type FilmTiming = { duration:number; introUntil:number; introDuration:number; playbackDuration:number; stillFrame:number };

export function createFilmTiming(duration:number,introUntil=0):FilmTiming {
 const introDuration=introUntil?Math.min(1800,introUntil/FILM_PLAYBACK_RATE):0;
 return {duration,introUntil,introDuration,playbackDuration:introDuration+(duration-introUntil)/FILM_PLAYBACK_RATE,stillFrame:Math.max(0,duration-600)};
}

export function filmFrameAt(timing:FilmTiming,elapsed:number,reduced=false,stillAt?:number):number {
 if(stillAt!==undefined)return stillAt;
 if(reduced)return timing.stillFrame;
 const within=Math.max(0,elapsed)%timing.playbackDuration;
 return within<timing.introDuration?within*timing.introUntil/timing.introDuration:timing.introUntil+(within-timing.introDuration)*FILM_PLAYBACK_RATE;
}

export function filmIsComplete(timing:FilmTiming,elapsed:number,reduced=false,stillAt?:number):boolean {
 return stillAt===undefined&&(reduced||elapsed>=timing.playbackDuration);
}
