'use strict';
const {createRequire}=require('node:module');
const root=require('node:path').resolve(__dirname,'../..');
const req=createRequire(root+'/package.json');
const {expect}=req('chai');
const {ethers,network,artifacts}=req('hardhat');
const {time}=req('@nomicfoundation/hardhat-network-helpers');
const {deployImplementations}=req('./scripts/deploy/implementations.cjs');
const {address:TOKEN}=req('./config/agialpha.json');
describe('Percentage stake: real collateral lifecycle',function(){
 let owner,buyer,agent,other,token,stake,registry,validation,dispute,initialFloor,snapshot;
 beforeEach(async()=>{
  snapshot=await network.provider.send('evm_snapshot');
  [owner,buyer,agent,other]=await ethers.getSigners();
  const tokenArtifact=await artifacts.readArtifact('contracts/test/MockERC20.sol:MockERC20');
  await network.provider.send('hardhat_setCode',[TOKEN,tokenArtifact.deployedBytecode]);
  token=await ethers.getContractAt('contracts/test/MockERC20.sol:MockERC20',TOKEN);
  const SF=await ethers.getContractFactory('contracts/v2/StakeManager.sol:StakeManager');
  stake=await SF.deploy(0,100,0,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,owner.address,await deployImplementations('StakeManager',SF.runner));
  await stake.setMinStake(1);await stake.setSlashingPercentages(100,0);initialFloor=await stake.minStakeFloor();
  validation=await (await ethers.getContractFactory('contracts/v2/mocks/ValidationStub.sol:ValidationStub')).deploy();
  const RF=await ethers.getContractFactory('contracts/v2/JobRegistry.sol:JobRegistry');
  registry=await RF.deploy(await validation.getAddress(),await stake.getAddress(),ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,ethers.ZeroAddress,5,0,[],owner.address,await deployImplementations('JobRegistry',RF.runner));
  dispute=await (await ethers.getContractFactory('contracts/v2/modules/DisputeModule.sol:DisputeModule')).deploy(await registry.getAddress(),0,1,ethers.ZeroAddress,owner.address);await dispute.setDisputeFee(0);await registry.setDisputeModule(await dispute.getAddress());await stake.setDisputeModule(await dispute.getAddress());await dispute.setStakeManager(await stake.getAddress());
  await validation.setJobRegistry(await registry.getAddress());
  await stake.setJobRegistry(await registry.getAddress());await stake.setValidationModule(await validation.getAddress());
  const identity=await (await ethers.getContractFactory('contracts/v2/mocks/IdentityRegistryMock.sol:IdentityRegistryMock')).deploy();await registry.setIdentityRegistry(await identity.getAddress());
  const policy=await (await ethers.getContractFactory('contracts/v2/TaxPolicy.sol:TaxPolicy')).deploy('ipfs://policy','ack');await registry.setTaxPolicy(await policy.getAddress());
  for(const who of [buyer,agent,other])await policy.connect(who).acknowledge();
  await registry.setFeePct(0);await registry.setValidatorRewardPct(0);await registry.setMinAgentStake(500);
  await token.mint(buyer.address,10000);await token.connect(buyer).approve(await stake.getAddress(),10000);
  await token.mint(agent.address,1000);await token.connect(agent).approve(await stake.getAddress(),1000);await stake.connect(agent).depositStake(0,500);
 });
 afterEach(async()=>{await network.provider.send('evm_revert',[snapshot]);});
 async function post(reward=101){const deadline=(await time.latest())+1000;const id=(await registry.nextJobId())+1n;const tx=await registry.connect(buyer).createJob(reward,deadline,ethers.id('spec'),'ipfs://spec');return{id,deadline,tx};}
 async function apply(id){return registry.connect(agent).applyForJob(id,'agent',[]);}
 async function settle(id,success){await registry.connect(agent).submit(id,ethers.id('result'),'ipfs://result','agent',[]);await validation.setResult(success);await validation.finalize(id);if(!success){await registry.connect(buyer)['raiseDispute(uint256,string)'](id,'reject');await time.increase(2);await dispute.resolveDispute(id,true);}await registry.connect(buyer).finalize(id);}
 it('locks the creation snapshot after a later owner rate change; rejects second application',async()=>{
  const {id}=await post();await registry.setJobStakeBps(10000);expect(await registry.quoteJobStake(101)).eq(101);expect((await registry.jobs(id)).stake).eq(11);
  await apply(id);expect(await stake.lockedStakes(agent.address)).eq(11);expect(await stake.stakes(agent.address,0)).eq(500);
  await expect(apply(id)).to.be.reverted;expect(await stake.lockedStakes(agent.address)).eq(11);
 });
 it('excludes actual escrow fee from stake and refunds reward plus fee on unassigned cancellation',async()=>{
  await registry.setFeePct(20);const {id,tx}=await post();expect((await registry.jobs(id)).stake).eq(11);expect(await token.balanceOf(buyer.address)).eq(9879);
  await expect(tx).to.emit(registry,'JobCreated').withArgs(id,buyer.address,ethers.ZeroAddress,101,11,20,ethers.id('spec'),'ipfs://spec');
  await registry.setJobStakeBps(10000);await registry.connect(buyer).cancelJob(id);expect(await token.balanceOf(buyer.address)).eq(10000);expect(await stake.lockedStakes(agent.address)).eq(0);await expect(apply(id)).to.be.reverted;
 });
 it('releases only the original job stake on success and preserves independent concurrent locks',async()=>{
  const first=await post();await apply(first.id);await registry.setJobStakeBps(2500);const second=await post();await apply(second.id);expect(await stake.lockedStakes(agent.address)).eq(37);
  await registry.setJobStakeBps(10000);await settle(first.id,true);expect(await stake.lockedStakes(agent.address)).eq(26);expect(await stake.stakes(agent.address,0)).eq(500);expect(await token.balanceOf(agent.address)).eq(601);
  await settle(second.id,true);expect(await stake.lockedStakes(agent.address)).eq(0);expect(await stake.stakes(agent.address,0)).eq(500);
 });
 it('slashes exactly the snapshotted collateral on rejected work despite new rate',async()=>{
  const {id}=await post();await apply(id);await registry.setJobStakeBps(10000);await settle(id,false);
  expect(await stake.stakes(agent.address,0)).eq(489);expect(await stake.lockedStakes(agent.address)).eq(0);expect(await token.balanceOf(buyer.address)).eq(10011);await expect(registry.connect(buyer).finalize(id)).to.be.reverted;
 });
 it('timeout refunds and slashes recorded stake once, not a new quote',async()=>{
  const {id,deadline}=await post();await apply(id);await registry.setJobStakeBps(0);await time.increaseTo(deadline+1);await registry.connect(buyer).claimTimeout(id);
  expect(await stake.stakes(agent.address,0)).eq(489);expect(await stake.lockedStakes(agent.address)).eq(0);expect(await token.balanceOf(buyer.address)).eq(10011);expect((await registry.jobs(id)).stake).eq(0);await expect(registry.connect(buyer).claimTimeout(id)).to.be.reverted;await expect(apply(id)).to.be.reverted;
 });
 it('settles a high-reputation worker without rolling back payout or the 11-unit collateral release',async()=>{
  const RF=await ethers.getContractFactory('contracts/v2/ReputationEngine.sol:ReputationEngine');
  const reputation=await RF.deploy(await stake.getAddress());
  await reputation.setCaller(owner.address,true);await reputation.setCaller(await registry.getAddress(),true);
  await reputation.add(agent.address,20000);expect(await reputation.reputation(agent.address)).eq(19036);
  await registry.setReputationEngine(await reputation.getAddress());
  const {id}=await post();await apply(id);expect(await stake.lockedStakes(agent.address)).eq(11);
  await settle(id,true);
  expect(await token.balanceOf(agent.address)).eq(601);expect(await stake.stakes(agent.address,0)).eq(500);
  expect(await stake.lockedStakes(agent.address)).eq(0);expect(await reputation.reputation(agent.address)).eq(19036);
  await expect(registry.connect(buyer).finalize(id)).to.be.revertedWithCustomError(registry,'NotReady');
  expect(await token.balanceOf(agent.address)).eq(601);expect(await stake.lockedStakes(agent.address)).eq(0);
 });
 it('zero job rate does not bypass global minimum; tiny reward locks one base unit',async()=>{
  await registry.setJobStakeBps(0);const zero=await post();await registry.setMinAgentStake(501);await expect(apply(zero.id)).to.be.revertedWithCustomError(registry,'InsufficientAgentStake');
  await registry.setMinAgentStake(500);await apply(zero.id);expect(await stake.lockedStakes(agent.address)).eq(0);expect(await stake.minStakeFloor()).eq(initialFloor);expect(await stake.minStake()).eq(1);
  await registry.setJobStakeBps(1000);const tiny=await post(1);await apply(tiny.id);expect(await stake.lockedStakes(agent.address)).eq(1);
 });
});
