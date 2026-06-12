import { Navigate } from 'react-router-dom';
import { useAuthenticationStatus } from '@nhost/react';

/**
 * Wraps any route that requires authentication.
 * Shows a spinner while Nhost resolves the session,
 * redirects to /login if unauthenticated.
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuthenticationStatus();

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Verifying session…</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default ProtectedRoute;
