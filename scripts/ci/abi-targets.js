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
];

module.exports = { ABI_TARGETS };
