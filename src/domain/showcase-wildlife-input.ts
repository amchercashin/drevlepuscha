import {unpackShowcasePosition} from './showcase-position.ts';
import {showcaseHeight} from './showcase.ts';
import {daylightAt} from './daylight.ts';
import {automaticWeather} from './weather.ts';
import type {WildlifeObserver} from './wildlife/types.ts';
import type {Player} from '../network/protocol.ts';
import type {ClockSample} from '../network/persistent-protocol.ts';
export const metricRoster=(players:Iterable<Player>,ready:ReadonlySet<string>,now:number):WildlifeObserver[]=>[...players].filter(p=>ready.has(p.id)).map(p=>{const pose=unpackShowcasePosition(p);return {...pose,id:p.id,h:showcaseHeight(pose.e,pose.n),observedAtMs:now};});
export function wildlifeEnvironment(clock:ClockSample){const seconds=(clock.serverMs-clock.epochMs)/1000,totalGameHours=12+seconds*24/clock.cycleSeconds;return {totalGameHours,daylight01:daylightAt(totalGameHours).daylight,precipitation01:automaticWeather(seconds).state.precipitation};}
