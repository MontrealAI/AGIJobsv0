> **Note:** Current deployments use an 18-decimal AGIALPHA token.

# Tax Obligations in the AGI Job Platform Ecosystem

## Overview of the AGI Jobs Token-Burning Scenario

In this platform, **AGI Employers** post jobs and fund them with tokens, while **AGI Agents** complete the jobs and earn tokens as payment. A key tokenomic feature is that when a job is successfully completed and validated, a portion of the tokens from the employer’s deposit is automatically **burned** (sent to an irretrievable address). This reduces the token supply. Importantly, the **smart contract** facilitating these transactions does **not** charge any fees or take custody of tokens; it simply executes the predefined logic (pay the agent and burn a portion). Below, we clarify the tax implications for each participant, ensuring that **all tax burdens fall on the employers, agents, or other active parties (like validators)** – and **none** on the smart contract or its owning corporation.

## Smart Contract & Platform Owner – **No Tax Liability** (Always Exempt)

**The smart contract itself** is just code on the blockchain and cannot incur tax obligations. Likewise, the **platform owner (the corporation deploying the contract)** has **zero tax implications** from the on-chain token burns or payments. This holds true **regardless of jurisdiction** because the platform owner:

- **Receives no income or fees:** The corporation does not collect any commission, service fee, or percentage of the transactions. With no revenue generated from the platform’s use, there is no taxable income to report.
- **Has no token ownership or disposal:** The corporation never takes possession of the tokens being transacted. Since it doesn’t own the tokens, it isn’t disposing of any asset when tokens are burned. No disposal means no capital gain or loss can possibly accrue to the platform owner.
- **Provides a free service (no taxable supply):** Merely providing the infrastructure for others’ transactions **without charging for it** means there’s no sale of goods or services by the corporation. Therefore, **no sales taxes** (e.g., TPS/TVQ in Quebec, VAT in Europe, GST in other jurisdictions) apply to the platform’s role. Sales and value-added taxes only apply to taxable goods or services supplied for consideration – here, the platform’s facilitation is free of charge.

**Universally, tax authorities require a taxable event (such as earning income, disposing of property, or charging for a service) to impose tax.** In this scenario, the contract owner corporation has no such events. It is essentially a neutral software provider, not a participant in the economic exchange. **In all major jurisdictions (US, Canada, EU, etc.), the result is the same: the platform owner has no tax liability stemming from the token-burning job transactions.** It does not need to report income, does not realize gains, and does not collect any transaction taxes for providing the platform.

## AGI Employers – **Taxable on Burned Tokens (Asset Disposal)**

AGI Employers are the parties funding the job and supplying the tokens that will be paid out and burned. **All tax responsibility for the act of burning tokens falls on the employer**, since they’re the ones disposing of their assets. Key points for employers:

- **Burning tokens = Disposal Event:** When the smart contract burns a portion of the employer’s tokens upon job completion, those tokens are permanently lost from the employer’s holdings. Tax-wise, this is treated as if the employer **disposed of property**. In other words, the employer is seen as giving up ownership of those tokens (even though no one else gains them, the tokens are destroyed).
- **Capital Gains or Losses:** Because burning is a disposal, the employer must assess if there’s a capital gain or loss on the burned tokens. This is calculated by comparing the **cost basis** of the burned tokens (what the employer originally paid or valued them at) to their **fair market value at the time of burn**.

  - If the tokens appreciated in value since the employer acquired them, the burn could trigger a **capital gain** for the employer (they disposed of an asset at a higher value than their purchase cost).
  - If the tokens depreciated, the employer incurs a **capital loss** on those tokens.

- **Example:** An employer acquired tokens at \$1 each. At job completion, suppose each token is worth \$5, and 100 tokens are burned. The employer effectively disposed of \$500 worth of tokens for no consideration. They would have a capital gain on those tokens of \$400 (since they originally paid \$100 total, and \$500 value was disposed). If the values were reversed (original cost \$500, value at burn \$100), it’d be a \$400 capital loss.
- **Business Expense vs. Capital Treatment:** The payment to the AGI agent for services rendered might be a deductible **business expense** for the employer (since it’s payment for completing a job). However, the **burned portion** doesn’t go to any service provider – it’s simply destroyed. Tax authorities are likely to view the burn as a **capital transaction** (disposition of an asset) rather than an expense, because no one received those tokens in exchange for services. In practice, the employer would handle the burned tokens on the capital account (report gains/losses), while the tokens paid to the agent are a business expense.
- **Jurisdiction-invariant:** These principles hold in any jurisdiction because the core idea is the same everywhere: you are taxed on gains when you dispose of property. The identity of where the tokens went (burn address) doesn’t exempt the act of disposal. The **employer alone** is responsible for any tax resulting from burning their tokens – the platform or contract isn’t involved in this tax calculation at all.

## AGI Agents (Workers) – **Taxable on Tokens Received as Income**

AGI Agents who complete the jobs **bear tax obligations on the compensation they receive** in tokens. All tax implications of earning and later using those tokens rest with the agent, not with the contract or platform. Key considerations for agents:

- **Tokens received = Income:** When an agent successfully completes a job and the smart contract transfers payment tokens to them, this is **income** to the agent. They must declare the value of the tokens received as income (e.g., ordinary income or self-employment income) for that tax year. The value is assessed at the **fair market value of the tokens at the time of receipt** (job completion). For instance, if an agent receives 50 tokens and each is worth \$10 at payout, they have \$500 of taxable income from that job.
- **No tax on burned portion:** Agents are **not taxed on tokens that were burned**, because those tokens never belonged to them. They only pay tax on what they actually receive. If 100 tokens were originally funded for the job and 10 are burned while 90 go to the agent, the agent is taxed only on the 90 they got. The burned 10 have no effect on the agent’s taxes (they’re handled by the employer as discussed above).
- **Subsequent Capital Gains/Losses:** If the agent holds onto the tokens after receiving them, any later change in token value will result in a capital gain or loss when the agent eventually sells or spends those tokens. Initially, at receipt, the agent’s cost basis in the tokens is set to the income value that was reported. Later:

  - If they sell the tokens at a higher price than that basis, they realize a **capital gain** and owe capital gains tax on the profit.
  - If they sell at a lower price, they have a **capital loss** (which may offset other gains, subject to tax rules).

- **Jurisdictional consistency:** Virtually all jurisdictions tax compensation received for work. Whether the payment is in fiat or crypto, the agent owes income tax on what they earned. The platform’s role is irrelevant to the agent’s income tax – it’s purely between the agent and their tax authority. The smart contract owner has **no responsibility** for reporting or withholding on these payments since it’s a decentralized transaction; compliance (reporting the income) is up to the agent.

## Validators – **Taxable on Any Rewards Earned**

If the platform uses **validators** (or similar participants) to verify and finalize job completions, and those validators receive **tokens as rewards or fees** for their service, then **validators bear the tax obligations on those rewards**. The contract and its owner again have no tax role here. Points to note:

- **Validator rewards = Income:** Any tokens awarded to validators (for example, a small percentage of the job payment or a fixed token reward for validating) are considered taxable income for the validator who receives them. Like the agents, a validator would declare the fair market value of tokens received for their work as income.
- **Example:** Suppose a validator gets a 1% fee in tokens from each job validated. If a job paid 90 tokens to an agent, 1% (0.9 tokens) might go to the validator. That 0.9 token’s value at the time of receipt is the validator’s income (if 1 token is worth \$10, then \$9 is income in this example).
- **Capital gains on holding:** If validators hold those reward tokens and later sell them, they would then be subject to capital gains tax on any appreciation (just as with agents and any crypto holder). The initial value at receipt is their cost basis.
- **No rewards, no tax:** If validators are **not** rewarded (i.e., they volunteer or the protocol doesn’t incentivize them with tokens), then there is no income and thus no tax for them from this activity. Their role would be like a volunteer service.
- **Platform’s role:** The smart contract and platform owner do not issue tax forms or withhold taxes on validator rewards. It’s the validator’s responsibility to track and report their token income. This is consistently true across jurisdictions – the person doing the work and earning tokens is liable for the tax on that income, not the platform providing the mechanism.

## Other Token Holders – **No Immediate Tax from Burn Events**

Aside from the active participants (employers, agents, validators), there may be **numerous other token holders** in the ecosystem (investors, users holding tokens for other purposes). It’s important to clarify that routine token burns **do not impose any tax on passive holders**:

- **No direct involvement, no tax:** If a person simply holds some of the platform’s tokens in their wallet and does not participate in a particular job transaction, the burning of tokens by someone else’s transaction does not create a taxable event for this passive holder. They neither received income nor disposed of their tokens during the burn event.
- **Value changes are unrealized:** A burn may indirectly affect the token’s market price (for example, reducing supply could increase scarcity and price). However, **unrealized gains** are not taxed. A holder’s tokens might go up in value on paper due to others burning tokens, but tax is only due when they **realize** that gain (i.e., when they sell or exchange their tokens for something of value).
- **Tax only on actual disposal:** The other holders will only face tax consequences when **they** decide to sell, trade, or otherwise dispose of their tokens. At that point, they calculate capital gains or losses based on how the token’s price moved since they acquired them. Until then, simply sitting on tokens (even as the supply shrinks from burns) has no tax impact.

This means the **tax burden of the burning mechanism is confined strictly to those engaging in the transactions** (the ones burning tokens or earning tokens). All other stakeholders who are not actively involved in a given transaction are unaffected tax-wise by that transaction.

## Summary: Platform is Tax-Exempt, Active Parties Bear Taxes

In this AGI jobs platform with a token-burning model, **the smart contract and its owning corporation are completely tax-exempt** with respect to the on-chain transactions. They do not earn, so they have no income; they do not own the transacted tokens, so they have no capital gains; they do not charge for their service, so no sales/VAT taxes apply. This remains true in any jurisdiction – tax law cannot attach liability to a party that has no economic gain or participation in the taxable event.

All **tax obligations fall on the active participants**:

- **AGI Employers** incur any capital gains taxes resulting from burning their tokens (a disposal of their assets). They effectively pay taxes on gains (or realize losses) when they burn tokens as part of paying for a job.
- **AGI Agents** pay income tax on the tokens they receive as payment for work (and later capital gains tax if those tokens appreciate by the time they sell them).
- **Validators** who earn token rewards for their work pay income tax on those tokens (and any capital gains upon later selling them).
- **No one else** – neither the platform, nor passive token holders, nor any other non-participating entity – has any tax liability from these token burns and payments.

**Bottom line:** The contract owner’s role is simply to provide a tool; it carries **no tax burden**. Tax responsibility is **strictly limited to the parties who actually exchange value** (those giving up tokens or receiving tokens). This clear delineation holds universally, ensuring the contract and its owner remain **entirely outside the scope of any tax obligations** in the operation of the platform.
