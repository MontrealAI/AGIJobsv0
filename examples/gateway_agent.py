import os
import json
import asyncio

import requests
import websockets

GATEWAY = os.getenv('GATEWAY_URL', 'http://localhost:3000')
AGENT_ID = 'agent-1'
WALLET = '0xYourWalletAddress'

requests.post(f'{GATEWAY}/agents', json={'id': AGENT_ID, 'wallet': WALLET})

async def main():
    async with websockets.connect(GATEWAY.replace('http', 'ws')) as ws:
        await ws.send(json.dumps({'type': 'register', 'id': AGENT_ID, 'wallet': WALLET}))
        async for message in ws:
            msg = json.loads(message)
            if msg.get('type') == 'job':
                job = msg['job']
                print('job received', job)
                await ws.send(json.dumps({'type': 'ack', 'id': AGENT_ID, 'jobId': job['jobId']}))
                requests.post(f"{GATEWAY}/jobs/{job['jobId']}/submit", json={'address': WALLET, 'result': 'result data'})

asyncio.run(main())
