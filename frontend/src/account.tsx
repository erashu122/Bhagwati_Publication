import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Customer } from '../../shared/store';

export class StoreError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function storeRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', 'X-Store-Request': '1' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new StoreError(response.status, data?.error ?? 'The store is unavailable. Try again in a moment.');
  }
  return data as T;
}

export function errorMessage(error: unknown) {
  return error instanceof StoreError ? error.message : 'Could not reach the store. Check your connection and try again.';
}

type AccountState = {
  customer: Customer | null;
  setCustomer: (customer: Customer | null) => void;
  loading: boolean;
  error: string;
  refresh: () => void;
};

const Account = createContext<AccountState | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError('');
    storeRequest<{ customer: Customer | null }>('/session').then(result => {
      if (current) setCustomer(result.customer);
    }).catch(error => {
      if (current) setError(errorMessage(error));
    }).finally(() => {
      if (current) setLoading(false);
    });
    return () => { current = false; };
  }, [attempt]);

  return <Account.Provider value={{ customer, setCustomer, loading, error, refresh: () => setAttempt(value => value + 1) }}>{children}</Account.Provider>;
}

export function useAccount() {
  const account = useContext(Account);
  if (!account) throw new Error('AccountProvider is required.');
  return account;
}

export function AccountLoading() {
  const { error, refresh } = useAccount();
  return <div className="container section"><div className="empty-panel">
    {error ? <><h1>Can’t open your account</h1><p role="alert">{error}</p><button type="button" className="button primary" onClick={refresh}>Try again</button></>
      : <p role="status">Checking your account…</p>}
  </div></div>;
}

export function RequireAccount({ children, checkout = false, operator = false }: { children: ReactNode; checkout?: boolean; operator?: boolean }) {
  const { customer, loading, error } = useAccount();
  if (loading || error) return <AccountLoading />;
  if (!customer) return <Navigate replace to={checkout ? '/register?next=checkout' : operator ? '/login?next=admin' : '/login'} />;
  if (operator && !customer.operator) return <div className="container section"><div className="empty-panel">
    <h1>Publisher access required</h1><Link className="button primary" to="/account">My account</Link>
  </div></div>;
  return children;
}
