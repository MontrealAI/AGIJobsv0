import React, { useState } from 'react';

export default function OwnerPanel() {
  const [paused, setPaused] = useState(false);
  const [temperature, setTemperature] = useState(0.84);
  const [status, setStatus] = useState('');

  const togglePause = () => {
    setPaused((prev) => !prev);
    setStatus(
      'Use scripts/v2/pauseSystem.ts to broadcast the pause transaction. The UI only mirrors the state.'
    );
  };

  const proposeThermostat = () => {
    setStatus(
      'Run scripts/v2/updateThermodynamics.ts with THERMOSTAT_PROPOSAL=demo/alpha-agi-mark/config/thermodynamics.demo.json.'
    );
  };

  return (
    <div>
      <button className={paused ? 'danger' : ''} onClick={togglePause}>
        {paused ? 'Unpause Platform' : 'Pause Platform'}
      </button>
      <div style={{ marginTop: '1rem' }}>
        <label>Thermostat temperature: {temperature.toFixed(2)}</label>
        <input
          type="range"
          min="0.5"
          max="1.2"
          step="0.01"
          value={temperature}
          onChange={(e) => setTemperature(parseFloat(e.target.value))}
        />
        <button onClick={proposeThermostat}>Propose Update</button>
      </div>
      <p className="status">{status}</p>
    </div>
  );
}
