import { useAuth } from './context/AuthContext';
import { LoginForm } from './components/LoginForm';

function App() {
  const { token, email, logout } = useAuth();

  if (!token) {
    return <LoginForm />;
  }

  return (
    <div>
      <p>Logged in as {email} <button onClick={logout}>Logout</button></p>
      <p>Applications list goes here — next step.</p>
    </div>
  );
}

export default App;
