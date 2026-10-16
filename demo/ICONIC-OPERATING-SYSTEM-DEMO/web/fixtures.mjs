export const taskSourceSha256 =
  'b20ea82745349c0cf5fc2633675b5003140a6bc7c3d2075f354f77ea6a59922c';
export const quotes = [
  {
    supplier: 'Boreal',
    quantity: 40,
    unitCents: 1250,
    shippingCents: 3000,
    deliveryDays: 5,
  },
  {
    supplier: 'Laurentian',
    quantity: 40,
    unitCents: 1100,
    shippingCents: 2000,
    deliveryDays: 12,
  },
  {
    supplier: 'Stellar',
    quantity: 40,
    unitCents: 1200,
    shippingCents: 1000,
    deliveryDays: 7,
  },
];
export const example = {
  schema: 'agijobs.supplier-evidence-desk.v1',
  taskSourceSha256:
    'b20ea82745349c0cf5fc2633675b5003140a6bc7c3d2075f354f77ea6a59922c',
  receipt: {
    artifacts: [
      {
        name: 'comparison.json',
        content:
          '{"maxDeliveryDays": 7, "quotes": [{"supplier": "Boreal", "totalCents": 53000, "eligible": true}, {"supplier": "Laurentian", "totalCents": 46000, "eligible": false}, {"supplier": "Stellar", "totalCents": 49000, "eligible": true}], "recommendedSupplier": "Stellar", "purchaseExecuted": false}',
        sha256:
          '61713d3ec0aeb383f0f0090ce11184ddaa49ad947165d53cfcf3e2034481a4cd',
      },
      {
        name: 'recommendation.md',
        content: 'Stellar is recommended. No purchase executed.',
        sha256:
          '06f8a25f80e83bb378b8da248b05983e42287ee89b8d1009e2056496da38983d',
      },
    ],
  },
  execution: {
    mode: 'scripted-browser-lab',
    providerCalls: 3,
    browserObserved: true,
    externalFetches: 0,
    workerTerminated: true,
  },
  usage: {
    inputTokens: null,
    outputTokens: null,
    reportedCostMicrousd: null,
  },
  policy: {
    maximumCalls: 3,
    maximumInputTokens: 20000,
    maximumOutputTokens: 5000,
    maximumCostMicrousd: 1000000,
  },
  productionApproved: false,
  settlementApproved: false,
};
