import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { Shell } from '@/components/app/shell';
import Dashboard from '@/pages/dashboard';
import Explore from '@/pages/explore';
import CoursePage from '@/pages/course';
import MyLearning from '@/pages/my-learning';
import Projects from '@/pages/projects';
import Logbook from '@/pages/logbook';
import Practice from '@/pages/practice';
import AiStudio from '@/pages/ai';
import Profile from '@/pages/profile';
import { Login, Register } from '@/pages/auth';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/explore" component={Explore} />
          <Route path="/courses/:id" component={CoursePage} />
          <Route path="/my-learning" component={MyLearning} />
          <Route path="/projects" component={Projects} />
          <Route path="/logbook" component={Logbook} />
          <Route path="/practice" component={Practice} />
          <Route path="/ai" component={AiStudio} />
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
          <Route path="/profile" component={Profile} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
