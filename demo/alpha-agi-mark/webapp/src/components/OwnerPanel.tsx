import React, { useState } from 'react';

export default function OwnerPanel(): JSX.Element {
  const [paused, setPaused] = useState(false);
  const [temperature, setTemperature] = useState(0.84);

  return (
    <div className="owner">
      <div className="pause">
        <button
          className={paused ? 'danger' : ''}
          onClick={() => {
            setPaused(!paused);
            alert('Invoke SystemPause via cli/mark.owner.ts or governance Safe.');
          }}
        >
          {paused ? 'Unpause' : 'Pause'}
        </button>
      </div>
      <div className="thermostat">
        <label>Thermostat temperature</label>
        <input
          type="range"
          min="0.5"
          max="1.2"
          step="0.01"
          value={temperature}
          onChange={(event) => setTemperature(Number(event.target.value))}
        />
        <button
          onClick={() =>
            alert(
              'Use scripts/v2/updateThermodynamics.ts with the desired JSON payload, then execute via Safe.'
            )
          }
        >
          Stage update
        </button>
      </div>
    </div>
  );
}
