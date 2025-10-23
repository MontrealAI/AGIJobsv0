'use strict';

const path = require('path');

const ABI_TARGETS = [
  {
    name: 'JobRegistry',
    artifact: path.join(
      'artifacts',
      'contracts/v2/JobRegistry.sol/JobRegistry.json'
    ),
    output: path.join('routes', 'job_registry.abi.json'),
    fragments: [
      {
        type: 'function',
        name: 'createJob',
        inputs: ['uint256', 'uint64', 'bytes32', 'string'],
      },
      {
        type: 'function',
        name: 'createJobWithAgentTypes',
        inputs: ['uint256', 'uint64', 'uint8', 'bytes32', 'string'],
      },
      { type: 'function', name: 'finalize', inputs: ['uint256'] },
      { type: 'function', name: 'jobs', inputs: ['uint256'] },
      { type: 'function', name: 'nextJobId', inputs: [] },
      { type: 'event', name: 'JobCreated' },
    ],
  },
  {
    name: 'JobRegistrySubgraph',
    artifact: path.join(
      'artifacts',
      'contracts/v2/JobRegistry.sol/JobRegistry.json'
    ),
    output: path.join('subgraph', 'abis', 'JobRegistry.json'),
    fragments: [
      { type: 'event', name: 'JobCreated' },
      { type: 'event', name: 'JobFinalized' },
      { type: 'event', name: 'JobDomainTagged' },
      { type: 'event', name: 'JobDomainCleared' },
    ],
  },
  {
    name: 'StakeManagerSubgraph',
    artifact: path.join(
      'artifacts',
      'contracts/v2/StakeManager.sol/StakeManager.json'
    ),
    output: path.join('subgraph', 'abis', 'StakeManager.json'),
    fragments: [
      { type: 'event', name: 'StakeDeposited' },
      { type: 'event', name: 'StakeSlashed' },
    ],
  },
  {
    name: 'ValidationModuleSubgraph',
    artifact: path.join(
      'artifacts',
      'contracts/v2/ValidationModule.sol/ValidationModule.json'
    ),
    output: path.join('subgraph', 'abis', 'ValidationModule.json'),
    fragments: [{ type: 'event', name: 'ValidationRevealed' }],
  },
  {
    name: 'DomainRegistrySubgraph',
    artifact: path.join(
      'artifacts',
      'contracts/v2/DomainRegistry.sol/DomainRegistry.json'
    ),
    output: path.join('subgraph', 'abis', 'DomainRegistry.json'),
    fragments: [
      { type: 'event', name: 'DomainRegistered' },
      { type: 'event', name: 'DomainMetadataUpdated' },
      { type: 'event', name: 'DomainRuntimeUpdated' },
      { type: 'event', name: 'DomainCapsUpdated' },
      { type: 'event', name: 'DomainStatusUpdated' },
      { type: 'event', name: 'DomainPaused' },
      { type: 'event', name: 'DomainResumed' },
      { type: 'event', name: 'SlugReassigned' },
      { type: 'event', name: 'Paused', inputs: ['address'] },
      { type: 'event', name: 'Unpaused', inputs: ['address'] },
    ],
  },
];

module.exports = { ABI_TARGETS };
