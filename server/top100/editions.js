// The editions the online Top 100 accepts, and the shape of their tournament, used to check results.
// Adding an edition: import its stages.json and edition.json below and add it to EDITIONS.

import celticStages from '../../editions/celtic/data/meta/stages.json' with { type: 'json' };
import celticEdition from '../../editions/celtic/data/edition.json' with { type: 'json' };
import beatlesStages from '../../editions/beatles/data/meta/stages.json' with { type: 'json' };
import beatlesEdition from '../../editions/beatles/data/edition.json' with { type: 'json' };

export function describeEdition(stagesFile, edition) {
  const stages = [...stagesFile.stages].sort((a, b) => a.order - b.order);
  const restart = stages.findIndex((s) => s.key === edition?.seasons?.restartStage);
  return {
    stages,
    rounds: stages.length,                 // questions in a first season
    restartIndex: Math.max(0, restart),    // later seasons start at this stage
  };
}

export const EDITIONS = {
  celtic: describeEdition(celticStages, celticEdition),
  beatles: describeEdition(beatlesStages, beatlesEdition),
};
