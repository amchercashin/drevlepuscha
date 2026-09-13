import {showcaseEnabled} from '../domain/showcase.ts';
import oak from '../../assets/trees/meshy-a/material-0.jpg';
import oakSmall from '../../assets/optimized/showcase/oak.webp';
import fork from '../../assets/trees/fork-oak/material-0.jpg';
import forkSmall from '../../assets/optimized/showcase/fork.webp';
import young from '../../assets/trees/young-tree/material-0.jpg';
import youngSmall from '../../assets/optimized/showcase/young.webp';
import rock from '../../assets/rocks/moss-boulder/material-0.jpg';
import rockSmall from '../../assets/optimized/showcase/rock.webp';
import log from '../../assets/props/fallen-log/material-0.jpg';
import logSmall from '../../assets/optimized/showcase/log.webp';
import stump from '../../assets/props/old-stump/material-0.jpg';
import stumpSmall from '../../assets/optimized/showcase/stump.webp';
import slab from '../../assets/props/slate-slab/material-0.jpg';
import slabSmall from '../../assets/optimized/showcase/slab.webp';
import soil from '../../assets/floor/soil.png';
import soilSmall from '../../assets/optimized/showcase/soil.webp';
import foliage from '../../assets/floor/foliage.png';
import foliageSmall from '../../assets/optimized/showcase/foliage.webp';

const textures=new Map<string,string>([[oak,oakSmall],[fork,forkSmall],[young,youngSmall],[rock,rockSmall],[log,logSmall],[stump,stumpSmall],[slab,slabSmall],[soil,soilSmall],[foliage,foliageSmall]]);
/** Lightweight showcase copies; the world keeps its existing material sources. */
export function showcaseTexture(url:string){return showcaseEnabled?textures.get(url)??url:url;}
