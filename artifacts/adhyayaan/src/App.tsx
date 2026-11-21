import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Redirect, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
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
import StudyPage from '@/pages/study';
import { AuthSplash, Login, Register, Welcome } from '@/pages/auth';
import { assessmentHref, useAuth } from '@/lib/app';
import { useHere } from '@/lib/use-here';
import Assessment, { AssessmentGuide, LearningReportPage } from '@/pages/assessment';
import { AdminDirectoryPage, AdminLearnerPage, AdminLearningReportPage } from '@/pages/admin';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });

function Router() {
  const [loc] = useLocation();
  const here = useHere();
  const { user, isLoading } = useAuth();
  if (loc === '/login' || loc === '/register') {
    return (
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/register" component={Register} />
        </Switch>
      </RoutedErrorBoundary>
    );
  }
  if (loc === '/assessment' || loc === '/assessment/guide') {
    return (
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/assessment/guide" component={AssessmentGuide} />
          <Route path="/assessment" component={Assessment} />
        </Switch>
      </RoutedErrorBoundary>
    );
  }
  if (isLoading) return <AuthSplash />;
  if (user?.assessmentRequired && !user.assessmentCompletedAt && !(user.isAdmin && /^\/admin(?:\/|$)/.test(loc))) {
    return <Redirect to={assessmentHref(here)} replace />;
  }
  if (loc === '/') {
    if (!user) return <RoutedErrorBoundary><Welcome /></RoutedErrorBoundary>;
  }
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/explore" component={Explore} />
          <Route path="/courses/:id" component={CoursePage} />
          <Route path="/study/:courseId/:lessonId" component={StudyPage} />
          <Route path="/study/:courseId" component={StudyPage} />
          <Route path="/my-learning" component={MyLearning} />
          <Route path="/projects" component={Projects} />
          <Route path="/logbook" component={Logbook} />
          <Route path="/practice" component={Practice} />
          <Route path="/ai" component={AiStudio} />
          <Route path="/profile/reports/:id" component={LearningReportPage} />
          <Route path="/profile" component={Profile} />
          <Route path="/admin/learners/:id/reports/:reportId" component={AdminLearningReportPage} />
          <Route path="/admin/learners/:id" component={AdminLearnerPage} />
          <Route path="/admin" component={AdminDirectoryPage} />
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
