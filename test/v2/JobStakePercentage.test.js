const {expect}=require('chai');
const {ethers,network}=require('hardhat');
const {deployImplementations}=require('../../scripts/deploy/implementations.cjs');
const {time}=require('@nomicfoundation/hardhat-network-helpers');

describe('Percentage job stake: new-release economics',function(){
 let registry,owner,other,Factory,modules;
 beforeEach(async()=>{
  [owner,other]=await ethers.getSigners();
  Factory=await ethers.getContractFactory('contracts/v2/JobRegistry.sol:JobRegistry');
  modules=await deployImplementations('JobRegistry',Factory.runner);
  registry=await Factory.deploy(...args(modules));
 });
 function args(impls,legacy=0){return [ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,5,legacy,[],owner.address,impls];}
 async function create(reward){const deadline=(await time.latest())+3600;const id=(await registry.nextJobId())+1n;const tx=await registry.createJob(reward,deadline,ethers.id('reviewed job'),'ipfs://job');return {id,tx,job:await registry.jobs(id)};}
 it('defaults to 10% of gross reward with ceil base-unit rounding and explicit zero rate',async()=>{
  expect(await registry.jobStakeBps()).to.equal(1000);
  for(const [reward,stake] of [[0n,0n],[1n,1n],[9n,1n],[10n,1n],[11n,2n],[10000n,1000n]]) expect(await registry.quoteJobStake(reward)).to.equal(stake);
  await registry.setJobStakeBps(0);expect(await registry.quoteJobStake(1)).to.equal(0);
  expect((await create(10)).job.stake).to.equal(0);
 });
 it('is owner-only, bounded and emits old/new rates',async()=>{
  await expect(registry.connect(other).setJobStakeBps(2000)).to.be.reverted;
  await expect(registry.setJobStakeBps(10001)).to.be.revertedWithCustomError(registry,'InvalidPercentage');
  await expect(registry.setJobStakeBps(10000)).to.emit(registry,'JobStakeBpsUpdated').withArgs(1000,10000);
  expect(await registry.quoteJobStake(10)).to.equal(10);
 });
 it('checks uint128 rewards and uint96 stake without truncation',async()=>{
  const max96=(1n<<96n)-1n;
  await registry.setJobStakeBps(10000);
  expect(await registry.quoteJobStake(max96)).to.equal(max96);
  await expect(registry.quoteJobStake(max96+1n)).to.be.revertedWithCustomError(registry,'StakeOverflow');
  await expect(registry.quoteJobStake(1n<<128n)).to.be.revertedWithCustomError(registry,'RewardOverflow');
  await registry.setJobStakeBps(0);expect(await registry.quoteJobStake((1n<<128n)-1n)).to.equal(0);
 });
 it('snapshots at creation, excludes protocol fee and preserves JobCreated.stake',async()=>{
  const first=await create(101);expect(first.job.stake).to.equal(11);
  await expect(first.tx).to.emit(registry,'JobCreated').withArgs(first.id,owner.address,ethers.ZeroAddress,101,11,0,ethers.id('reviewed job'),'ipfs://job');
  await registry.setJobStakeBps(2500);
  expect((await registry.jobs(first.id)).stake).to.equal(11);
  expect((await create(101)).job.stake).to.equal(26);
 });
 it('applies creation-time rate after prospective quote and rejects zero-reward creation',async()=>{
  expect(await registry.quoteJobStake(100)).to.equal(10);
  await registry.setJobStakeBps(2000);expect((await create(100)).job.stake).to.equal(20);
  await expect(create(0)).to.be.revertedWithCustomError(registry,'JobParametersUnset');
 });
 it('fails closed on fixed getter/setter, compound setter and nonzero legacy constructor values',async()=>{
  for(const action of [()=>registry.jobStake(),()=>registry.DEFAULT_JOB_STAKE(),()=>registry.setJobStake(500),()=>registry.setJobParameters(100,500)]) await expect(action()).to.be.revertedWithCustomError(registry,'LegacyFixedStakeUnsupported');
  await expect(Factory.deploy(...args(modules,500))).to.be.revertedWithCustomError(registry,'LegacyFixedStakeUnsupported');
 });
 it('does not conflate global admission minimum with per-job percentage',async()=>{
  await registry.setMinAgentStake(500);
  expect(await registry.minAgentStake()).to.equal(500);
  expect(await registry.quoteJobStake(100)).to.equal(10);
  await registry.setJobStakeBps(0);expect(await registry.minAgentStake()).to.equal(500);
 });
 it('requires percentage-stake module IDs for every fixed delegate',async()=>{
  for(let i=0;i<modules.length;i++){
   const name=['JobRegistryConfiguration','JobRegistryLifecycle','JobRegistrySettlement'][i];
   const Old=await ethers.getContractFactory('LegacyJobImplementationIdentity');
   const oldModule=await Old.deploy(ethers.id(`${name}:v1`));
   const mixed=[...modules];mixed[i]=await oldModule.getAddress();
   await expect(Factory.deploy(...args(mixed))).to.be.reverted;
  }
 });
 it('matches bounded integer reference math across rates/rewards',async()=>{
  for(const bps of [0n,1n,999n,1000n,1001n,9999n,10000n]){
   await registry.setJobStakeBps(bps);
   for(const reward of [0n,1n,9n,10n,9999n,10000n,10001n,10n**25n]) expect(await registry.quoteJobStake(reward)).to.equal((reward*bps+9999n)/10000n);
  }
 });
});
