import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setUserRole } from '../../../data/api';
import { useAuth } from '../../../data/auth';
import { keys, useProfiles } from '../../../data/queries';
import type { Role } from '../../../data/rows';
import { formatDate } from '../../../lib/time';
import { Badge, Card, ErrorBox, PageTitle, Select, Spinner } from '../../components/ui';

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  leider: 'Wedstrijdleider',
  aanvraag: 'Aanvraag',
  geweigerd: 'Geweigerd',
};

export function UsersPage() {
  const { isAdmin, session } = useAuth();
  const { data, isLoading, error } = useProfiles(isAdmin);
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => setUserRole(userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.profiles }),
  });

  if (!isAdmin) return <ErrorBox>Enkel admins kunnen gebruikers beheren.</ErrorBox>;
  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  const requests = (data ?? []).filter((p) => p.role === 'aanvraag');

  return (
    <div>
      <PageTitle sub="Wedstrijdleiders kunnen avonden leiden; admins kunnen alles, ook seizoenen en gebruikers beheren.">Gebruikers</PageTitle>
      {requests.length > 0 && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-amber-900">
          {requests.length} nieuwe aanvra{requests.length === 1 ? 'ag' : 'gen'}: kies hieronder een rol om goed te keuren.
        </p>
      )}
      {change.error && <ErrorBox error={change.error} />}
      <div className="space-y-2">
        {(data ?? []).map((p) => (
          <Card key={p.user_id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-semibold">
                {p.display_name || p.email} {p.user_id === session?.user.id && <Badge>jij</Badge>}
              </div>
              <div className="text-sm text-stone-500">
                {p.email} · sinds {formatDate(Date.parse(p.created_at))}
              </div>
            </div>
            <Select
              className="w-48"
              value={p.role}
              onChange={(e) => change.mutate({ userId: p.user_id, role: e.target.value as Role })}
              aria-label={`Rol van ${p.display_name || p.email}`}
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </Select>
          </Card>
        ))}
      </div>
    </div>
  );
}
