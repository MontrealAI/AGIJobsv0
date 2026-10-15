'use strict';
// Diagnostic of a known inherited defect, NOT a deployment gate pass. Local fixture only.
const assert = require('node:assert/strict');
const {ethers,network} = require('hardhat');
async function main(){
 if(network.name!=='hardhat'||network.config.url||network.config.forking)throw Error('Private in-process unforked Hardhat only');
 const metadata=await ethers.provider.send('hardhat_metadata',[]);
 if(!metadata.instanceId||metadata.forkedNetwork)throw Error('Cannot verify a disposable local instance');
 const [owner]=await ethers.getSigners();
 const Factory=await ethers.getContractFactory('contracts/v2/ReputationEngine.sol:ReputationEngine');
 const Stake=await ethers.getContractFactory('MockStakeManager');
 const stake=await Stake.deploy();
 const reputation=await Factory.deploy(await stake.getAddress());
 await reputation.setCaller(owner.address,true);
 await reputation.add(owner.address,20000);
 const score=await reputation.reputation(owner.address);assert.equal(score,19036n);
 let panic=false;
 try{await reputation.add(owner.address,1);}catch(error){panic=String(error).includes('0x11')||String(error).includes('17');if(!panic)throw error;}
 assert.equal(panic,true);assert.equal(await reputation.reputation(owner.address),score);
 let finalizePanic=false;
 const payout=ethers.parseEther('100'), duration=100000;
 const points=await reputation.calculateReputationPoints(payout,duration);
 try{await reputation.onFinalize(owner.address,true,payout,duration);}catch(error){finalizePanic=String(error).includes('0x11')||String(error).includes('17');if(!finalizePanic)throw error;}
 assert.equal(finalizePanic,true);
 console.log(JSON.stringify({scoreAfter20000:score.toString(),addingOneRevertsArithmeticPanic:true,successfulFinalizationReputationHookReverts:true,finalizationPoints:points.toString(),scoreUnchangedAfterRevert:true,productionBlocker:true,externalTransactions:false}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
