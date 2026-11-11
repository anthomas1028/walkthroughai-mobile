import { router, useLocalSearchParams, type Href } from 'expo-router';

type Parent = 'home' | 'customer' | 'history' | 'capture' | 'account';
type Params = Record<string, unknown>;
const single = (value: unknown) => String(Array.isArray(value) ? value[0] ?? '' : value ?? '');

// Header arrows describe the app hierarchy, not the browser's prior document.
// dismissTo reuses the parent when present and replaces the page on direct entry.
export function backDestination(parent: Parent, params: Params): Href {
  if (params.teamSessionId) return {pathname:'/shared',params:{visitId:single(params.teamSessionId)}};
  if (parent === 'home') return '/';
  if (parent === 'account') return '/account';
  const customerId = single(params.customerId);
  if (!customerId || !Number.isFinite(Number(customerId)) || Number(customerId) <= 0) return '/';
  return {
    pathname: parent === 'capture' ? '/walkthrough' : parent === 'history' ? '/history' : '/customer-dashboard',
    params: {
      customerId,
      customerName: single(params.customerName),
      readOnly: single(params.readOnly) || 'false',
      ...(parent === 'capture' ? { customerEmail: single(params.customerEmail), contactName: single(params.contactName) } : {}),
    },
  };
}

export function useBackTo(parent: Parent) {
  const params = useLocalSearchParams();
  return (overrides: Params = {}) => {
    if (router.canGoBack()) router.back();
    else router.replace(backDestination(parent, { ...params, ...overrides }));
  };
}
