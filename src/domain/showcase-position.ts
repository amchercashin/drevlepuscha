import {FOREST_BOUNDS as B} from './forest-layout.ts';
import type {MetricPlayerPose} from './wildlife/types.ts';
import type {Position} from '../network/protocol.ts';
export const packShowcasePosition=(p:MetricPlayerPose):Position=>({x:(p.e-B.minE)/(B.maxE-B.minE),y:(p.n-B.minN)/(B.maxN-B.minN),heading:p.headingDeg,speed:p.speedMps,running:p.running,seq:0});
export const unpackShowcasePosition=(p:Position):MetricPlayerPose=>({e:B.minE+p.x*(B.maxE-B.minE),n:B.minN+p.y*(B.maxN-B.minN),headingDeg:p.heading??0,speedMps:p.speed??0,running:p.running??false});
