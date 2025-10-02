import { expect } from 'chai';
import { ethers, network } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { AGIALPHA, AGIALPHA_DECIMALS } from '../../scripts/constants';
import { setErc20Balance, setUintStorage } from '../utils/tokenStorage';

enum Role {
  Agent,
  Validator,
  Platform,
}

const FORK_URL =
  process.env.MAINNET_FORK_URL ||
  process.env.HARDHAT_FORK_URL ||
  process.env.MAINNET_RPC_URL;

const describeFork = FORK_URL ? describe : describe.skip;

describeFork('Mainnet fork · job lifecycle drill', function () {
  this.timeout(240_000);

  const TOTAL_SUPPLY_SLOT = 2;
  const MINT_PER_ACCOUNT = '1000';
  const NFT_PRICE = '50';
  const JOB_REWARD = '100';

  let snapshotId: string;

  before(async function () {
    if (!FORK_URL) {
      this.skip();
      return;
    }

    const blockNumber = process.env.MAINNET_FORK_BLOCK
      ? Number(process.env.MAINNET_FORK_BLOCK)
      : undefined;

    await network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: FORK_URL,
            ...(blockNumber ? { blockNumber } : {}),
          },
        },
      ],
    });
    await network.provider.send('hardhat_setNextBlockBaseFeePerGas', ['0x0']);

    const token = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata',
      AGIALPHA
    );

    const decimals = await token.decimals();
    expect(decimals).to.equal(AGIALPHA_DECIMALS);

    const [owner, employer, agent, validator, buyer, moderator, treasury] =
      await ethers.getSigners();

    const mintAmount = ethers.parseUnits(MINT_PER_ACCOUNT, decimals);
    const holders = [
      owner.address,
      employer.address,
      agent.address,
      validator.address,
      buyer.address,
      treasury.address,
    ];

    for (const holder of holders) {
      await setErc20Balance(AGIALPHA, holder, mintAmount);
    }

    const existingSupply = await token.totalSupply();
    const additional = mintAmount * BigInt(holders.length);
    await setUintStorage(
      AGIALPHA,
      TOTAL_SUPPLY_SLOT,
      existingSupply + additional
    );

    for (const holder of holders) {
      const balance = await token.balanceOf(holder);
      expect(balance).to.equal(mintAmount);
    }

    snapshotId = await network.provider.send('evm_snapshot');
  });

  beforeEach(async function () {
    if (!snapshotId) {
      this.skip();
      return;
    }
    await network.provider.send('evm_revert', [snapshotId]);
    snapshotId = await network.provider.send('evm_snapshot');
  });

  it('executes the happy-path job lifecycle using forked $AGIALPHA state', async function () {
    const [owner, employer, agent, validator, buyer, moderator, treasury] =
      await ethers.getSigners();

    const Validation = await ethers.getContractFactory(
      'contracts/v2/mocks/ValidationStub.sol:ValidationStub'
    );
    const validation = await Validation.deploy();

    const Stake = await ethers.getContractFactory(
      'contracts/v2/StakeManager.sol:StakeManager'
    );
    const stake = await Stake.deploy(
      0,
      50,
      50,
      treasury.address,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      owner.address
    );

    const TaxPolicy = await ethers.getContractFactory(
      'contracts/v2/TaxPolicy.sol:TaxPolicy'
    );
    const taxPolicy = await TaxPolicy.deploy(
      'ipfs://policy',
      'All taxes on participants; contract and owner exempt'
    );

    const Reputation = await ethers.getContractFactory(
      'contracts/v2/ReputationEngine.sol:ReputationEngine'
    );
    const reputation = await Reputation.deploy(await stake.getAddress());

    const ENS = await ethers.getContractFactory('MockENS');
    const ens = await ENS.deploy();
    const Wrapper = await ethers.getContractFactory('MockNameWrapper');
    const wrapper = await Wrapper.deploy();

    const Identity = await ethers.getContractFactory(
      'contracts/v2/IdentityRegistry.sol:IdentityRegistry'
    );
    const identity = await Identity.deploy(
      await ens.getAddress(),
      await wrapper.getAddress(),
      await reputation.getAddress(),
      ethers.ZeroHash,
      ethers.ZeroHash
    );
    await identity.addAdditionalAgent(agent.address);

    const NFT = await ethers.getContractFactory(
      'contracts/v2/CertificateNFT.sol:CertificateNFT'
    );
    const nft = await NFT.deploy('Cert', 'CERT');

    const Registry = await ethers.getContractFactory(
      'contracts/v2/JobRegistry.sol:JobRegistry'
    );
    const registry = await Registry.deploy(
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      ethers.ZeroAddress,
      await nft.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      0,
      0,
      [],
      owner.address
    );

    const Dispute = await ethers.getContractFactory(
      'contracts/v2/modules/DisputeModule.sol:DisputeModule'
    );
    const dispute = await Dispute.deploy(
      await registry.getAddress(),
      0,
      0,
      moderator.address,
      owner.address
    );

    const FeePool = await ethers.getContractFactory(
      'contracts/v2/FeePool.sol:FeePool'
    );
    const feePool = await FeePool.deploy(
      await stake.getAddress(),
      0,
      treasury.address,
      await taxPolicy.getAddress()
    );

    await stake.setModules(
      await registry.getAddress(),
      await dispute.getAddress()
    );
    await validation.setJobRegistry(await registry.getAddress());
    await nft.setJobRegistry(await registry.getAddress());
    await nft.setStakeManager(await stake.getAddress());
    await registry.setModules(
      await validation.getAddress(),
      await stake.getAddress(),
      await reputation.getAddress(),
      await dispute.getAddress(),
      await nft.getAddress(),
      await feePool.getAddress(),
      []
    );
    await registry.setTaxPolicy(await taxPolicy.getAddress());
    await taxPolicy.setAcknowledger(await registry.getAddress(), true);
    await feePool.setStakeManager(await stake.getAddress());
    await feePool.setTreasury(treasury.address);
    await feePool.setRewarder(await validation.getAddress(), true);
    await registry.setIdentityRegistry(await identity.getAddress());
    await reputation.setCaller(await registry.getAddress(), true);
    await reputation.setPremiumThreshold(0);

    const token = await ethers.getContractAt(
      '@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol:IERC20Metadata',
      AGIALPHA
    );

    await registry.connect(employer).acknowledgeTaxPolicy();
    await registry.connect(agent).acknowledgeTaxPolicy();

    const stakeAmount = ethers.parseUnits('1', AGIALPHA_DECIMALS);
    await token.connect(agent).approve(await stake.getAddress(), stakeAmount);
    expect(
      await token.allowance(agent.address, await stake.getAddress())
    ).to.equal(stakeAmount);
    await stake.connect(agent).depositStake(Role.Agent, stakeAmount);

    const subdomain = 'agent';
    const subnode = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes32', 'bytes32'],
        [ethers.ZeroHash, ethers.id(subdomain)]
      )
    );
    await wrapper.setOwner(BigInt(subnode), agent.address);
    expect(
      await identity.isAuthorizedAgent(agent.address, subdomain, [])
    ).to.equal(true);

    const reward = ethers.parseUnits(JOB_REWARD, AGIALPHA_DECIMALS);
    const feePct = await registry.feePct();
    const rewardWithFee = (reward * (100n + feePct)) / 100n;
    await token
      .connect(employer)
      .approve(await stake.getAddress(), rewardWithFee);
    expect(
      await token.allowance(employer.address, await stake.getAddress())
    ).to.equal(rewardWithFee);
    const deadline = BigInt((await time.latest()) + 3600);
    const specHash = ethers.id('spec');
    await registry
      .connect(employer)
      .createJob(reward, deadline, specHash, 'ipfs://job');

    await registry.connect(agent).applyForJob(1, subdomain, []);
    const resultHash = ethers.id('ipfs://result');
    await registry
      .connect(agent)
      .submit(1, resultHash, 'ipfs://result', subdomain, []);
    await validation.setResult(true);
    await validation.finalize(1);
    await registry.connect(employer).finalize(1);

    const price = ethers.parseUnits(NFT_PRICE, AGIALPHA_DECIMALS);
    await nft.connect(agent).list(1, price);
    await token.connect(buyer).approve(await nft.getAddress(), price);
    await nft.connect(buyer).purchase(1);

    expect(await nft.ownerOf(1)).to.equal(buyer.address);
    expect(await token.balanceOf(agent.address)).to.equal(
      ethers.parseUnits('1149', AGIALPHA_DECIMALS)
    );
  });
});
