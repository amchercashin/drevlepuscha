import {startServer} from '../../server/index.mjs';
const server=await startServer({dataDir:process.argv[2],clientUrl:'http://127.0.0.1:4173/',wildlife:process.argv[3]==='wildlife'});
process.send({ready:true,link:server.link});
process.on('message',message=>{if(message==='stats')process.send({stats:server.stats(),cpu:process.cpuUsage(),uptime:process.uptime()});});
const close=()=>{void server.close().finally(()=>process.exit(0));};
process.on('SIGTERM',close);process.on('SIGINT',close);
