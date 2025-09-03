import { useState } from 'react';
import { ethers } from 'ethers';

export default function AttestPage() {
  const [name, setName] = useState('');
  const [role, setRole] = useState('0');
  const [who, setWho] = useState('');
  const [message, setMessage] = useState('');

  async function send(action: 'attest' | 'revoke') {
    try {
      if (!(window as any).ethereum) {
        alert('wallet not found');
        return;
      }
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const registryAddr = process.env.NEXT_PUBLIC_ATTESTATION_ADDRESS;
      if (!registryAddr) {
        alert('attestation registry not configured');
        return;
      }
      const abi = [
        'function attest(bytes32 node, uint8 role, address who)',
        'function revoke(bytes32 node, uint8 role, address who)'
      ];
      const contract = new ethers.Contract(registryAddr, abi, signer);
      const node = ethers.namehash(name);
      const tx =
        action === 'attest'
          ? await contract.attest(node, Number(role), who)
          : await contract.revoke(node, Number(role), who);
      await tx.wait();
      setMessage(`${action} tx confirmed`);
    } catch (err) {
      console.error(err);
      setMessage('transaction failed');
    }
  }

  return (
    <main>
      <h1>Manage Attestations</h1>
      <label>
        ENS Name:
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Role:
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="0">Agent</option>
          <option value="1">Validator</option>
        </select>
      </label>
      <label>
        Address:
        <input value={who} onChange={(e) => setWho(e.target.value)} />
      </label>
      <div>
        <button onClick={() => send('attest')}>Attest</button>
        <button onClick={() => send('revoke')}>Revoke</button>
      </div>
      {message && <p>{message}</p>}
    </main>
  );
}

