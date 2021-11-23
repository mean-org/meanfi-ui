import { useContext } from 'react';
import { Redirect, Route, RouteProps } from 'react-router';
import { AppStateContext } from '../../contexts/appstate';
import { consoleOut, isLocal } from '../../utils/ui';

export type ProtectedRouteProps = {
  authenticationPath: string;
} & RouteProps;

export const ProtectedRoute = ({authenticationPath, ...routeProps}: ProtectedRouteProps) => {

  const { isWhitelisted } = useContext(AppStateContext);
  const isAuthenticated = isLocal() || isWhitelisted;

  consoleOut('isAuthenticated:', isAuthenticated, 'blue');

  if(isAuthenticated) {
    return <Route {...routeProps} />;
  } else {
    return <Redirect to={{ pathname: authenticationPath }} />;
  }
};
