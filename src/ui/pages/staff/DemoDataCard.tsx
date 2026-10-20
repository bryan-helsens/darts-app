import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { loadDemoData, removeDemoData } from '../../../data/api';
import { useHasDemoData } from '../../../data/queries';
import { buildDemoDataset, DEMO_PIN, demoOptionsForToday } from '../../../demo/demoData';
import { todayInBrussels } from '../../../lib/time';
import { Button, Card, ConfirmModal, ErrorBox } from '../../components/ui';

/** Demo-data laden of verwijderen (enkel admins). */
export function DemoDataCard() {
  const qc = useQueryClient();
  const { data: loaded, isLoading } = useHasDemoData();
  const [confirm, setConfirm] = useState<'load' | 'remove' | null>(null);
  const action = useMutation({
    mutationFn: async (kind: 'load' | 'remove') => {
      if (kind === 'load') await loadDemoData(buildDemoDataset(demoOptionsForToday(todayInBrussels())));
      else await removeDemoData();
    },
    onSuccess: async () => {
      setConfirm(null);
      await qc.invalidateQueries();
    },
    onError: () => setConfirm(null),
  });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold text-zinc-950">Demo-data</h2>
          <p className="text-xs text-zinc-500">
            {isLoading
              ? 'Even kijken…'
              : loaded
                ? `Er staat demo-data in de app: een demoseizoen met 25 spelers, 6 gespeelde avonden en een oefenavond (score-pin ${DEMO_PIN}).`
                : 'Vul de app met fictieve spelers, uitslagen en een oefenavond vandaag, om alles uit te proberen. Echte gegevens blijven ongemoeid.'}
          </p>
        </div>
        {!isLoading &&
          (loaded ? (
            <Button variant="secondary" size="sm" onClick={() => setConfirm('remove')} disabled={action.isPending}>
              Demo-data verwijderen
            </Button>
          ) : (
            <Button size="sm" onClick={() => setConfirm('load')} disabled={action.isPending}>
              Demo-data laden
            </Button>
          ))}
      </div>
      {action.error && (
        <div className="mt-2">
          <ErrorBox error={action.error} />
        </div>
      )}
      <ConfirmModal
        open={confirm !== null}
        title={confirm === 'load' ? 'Demo-data laden?' : 'Demo-data verwijderen?'}
        confirmLabel={confirm === 'load' ? 'Laden' : 'Verwijderen'}
        danger={confirm === 'remove'}
        busy={action.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && action.mutate(confirm)}
      >
        {confirm === 'load' ? (
          <p>
            Er komt een apart “Demoseizoen” bij met 25 fictieve spelers, 6 gespeelde avonden en een oefenavond vandaag (score-pin {DEMO_PIN}). Op de publieke site is
            die data ook zichtbaar zolang ze bestaat.
          </p>
        ) : (
          <p>Het demoseizoen, de demo-avonden en de fictieve spelers worden verwijderd. Echte seizoenen, avonden en spelers blijven bewaard.</p>
        )}
      </ConfirmModal>
    </Card>
  );
}
