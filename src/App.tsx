import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Briefcase, 
  Trello, 
  DollarSign, 
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Edit2,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  LogOut,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  parseISO,
  startOfWeek,
  endOfWeek
} from 'date-fns';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  PieChart,
  Pie
} from 'recharts';
import { cn, type Client, type Opportunity, type Project, type Transaction } from './types';
import { auth, db, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { ref, onValue, push, set, remove, update } from 'firebase/database';

// --- Components ---

const Card = ({ children, className }: { children: React.ReactNode, className?: string, key?: string | number }) => (
  <div className={cn("bg-card border border-border rounded-xl shadow-sm overflow-hidden", className)}>
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled
}: { 
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger',
  className?: string,
  disabled?: boolean
}) => {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:opacity-90",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "bg-transparent hover:bg-muted text-muted-foreground hover:text-foreground",
    danger: "bg-destructive text-destructive-foreground hover:opacity-90"
  };

  return (
    <motion.button 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick} 
      disabled={disabled}
      className={cn("px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2", variants[variant], className)}
    >
      {children}
    </motion.button>
  );
};

const Input = ({ label, ...props }: { label?: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>}
    <input 
      {...props} 
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
    />
  </div>
);

const Select = ({ label, options, ...props }: { label?: string, options: { value: string, label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div className="flex flex-col gap-1.5 w-full">
    {label && <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>}
    <select 
      {...props} 
      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <>
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          exit={{ opacity: 0 }} 
          onClick={onClose}
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50" 
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 40 }} 
          animate={{ opacity: 1, scale: 1, y: 0 }} 
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%] w-[90%] max-w-lg bg-card border border-border rounded-2xl shadow-2xl z-50 p-6"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold">{title}</h2>
            <Button variant="ghost" onClick={onClose} className="p-2 h-auto rounded-full">
              <Plus className="rotate-45" size={20} />
            </Button>
          </div>
          {children}
        </motion.div>
      </>
    )}
  </AnimatePresence>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isAllowed, setIsAllowed] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'crm' | 'finance' | 'projects' | 'clients'>('dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'client' | 'opportunity' | 'project' | 'transaction' | null>(null);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  // Form states
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', company: '' });
  const [oppForm, setOppForm] = useState({ title: '', client_id: '', value: '', status: 'lead', description: '' });
  const [projectForm, setProjectForm] = useState({ name: '', client_id: '', status: 'active', budget: '', deadline: '' });
  const [transForm, setTransForm] = useState({ type: 'income', category: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), description: '', is_recurring: false });
  const [selectedDayTransactions, setSelectedDayTransactions] = useState<{ date: Date, transactions: Transaction[] } | null>(null);
  const [isFabOpen, setIsFabOpen] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        const allowedEmails = import.meta.env.VITE_ALLOWED_EMAILS?.split(',') || [];
        setIsAllowed(allowedEmails.includes(u.email || ''));
      } else {
        setIsAllowed(false);
      }
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user && isAllowed) {
      const clientsRef = ref(db, 'clients');
      const oppsRef = ref(db, 'opportunities');
      const projectsRef = ref(db, 'projects');
      const transRef = ref(db, 'transactions');

      const unsubClients = onValue(clientsRef, (snapshot) => {
        const data = snapshot.val();
        const list = data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
        setClients(list.sort((a, b) => a.name.localeCompare(b.name)));
      });

      const unsubOpps = onValue(oppsRef, (snapshot) => {
        const data = snapshot.val();
        const list = data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
        setOpportunities(list);
      });

      const unsubProjects = onValue(projectsRef, (snapshot) => {
        const data = snapshot.val();
        const list = data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
        setProjects(list);
      });

      const unsubTrans = onValue(transRef, (snapshot) => {
        const data = snapshot.val();
        const list = data ? Object.entries(data).map(([id, val]: [string, any]) => ({ id, ...val })) : [];
        setTransactions(list.sort((a, b) => b.date.localeCompare(a.date)));
      });

      return () => {
        unsubClients();
        unsubOpps();
        unsubProjects();
        unsubTrans();
      };
    }
  }, [user, isAllowed]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const handleLogin = () => signInWithPopup(auth, googleProvider);
  const handleLogout = () => signOut(auth);

  const handleEdit = (type: 'client' | 'opportunity' | 'project' | 'transaction', data: any) => {
    setModalType(type);
    setEditingId(data.id);
    if (type === 'client') {
      setClientForm({ name: data.name, email: data.email, phone: data.phone, company: data.company });
    } else if (type === 'opportunity') {
      setOppForm({ title: data.title, client_id: data.client_id?.toString() || '', value: data.value.toString(), status: data.status, description: data.description });
    } else if (type === 'project') {
      setProjectForm({ name: data.name, client_id: data.client_id?.toString() || '', status: data.status, budget: data.budget.toString(), deadline: data.deadline });
    } else if (type === 'transaction') {
      setTransForm({ type: data.type, category: data.category, amount: data.amount.toString(), date: data.date, description: data.description, is_recurring: !!data.is_recurring });
    }
    setIsModalOpen(true);
  };

  const handleAdd = async () => {
    let path = '';
    let body = {};

    if (modalType === 'client') {
      path = 'clients';
      body = clientForm;
    } else if (modalType === 'opportunity') {
      path = 'opportunities';
      const client = clients.find(c => c.id.toString() === oppForm.client_id);
      body = { ...oppForm, client_id: oppForm.client_id, client_name: client?.name || '', value: parseFloat(oppForm.value) };
    } else if (modalType === 'project') {
      path = 'projects';
      const client = clients.find(c => c.id.toString() === projectForm.client_id);
      body = { ...projectForm, client_id: projectForm.client_id, client_name: client?.name || '', budget: parseFloat(projectForm.budget) };
    } else if (modalType === 'transaction') {
      path = 'transactions';
      body = { ...transForm, amount: parseFloat(transForm.amount) };
    }

    if (editingId) {
      await set(ref(db, `${path}/${editingId}`), { ...body, id: editingId });
    } else {
      const newRef = push(ref(db, path));
      await set(newRef, { ...body, id: newRef.key });
    }

    setIsModalOpen(false);
    resetForms();
  };

  const handleDelete = async (type: string, id: string | number) => {
    if (!confirm('Tem certeza que deseja excluir?')) return;
    await remove(ref(db, `${type}/${id}`));
  };

  const resetForms = () => {
    setEditingId(null);
    setClientForm({ name: '', email: '', phone: '', company: '' });
    setOppForm({ title: '', client_id: '', value: '', status: 'lead', description: '' });
    setProjectForm({ name: '', client_id: '', status: 'active', budget: '', deadline: '' });
    setTransForm({ type: 'income', category: '', amount: '', date: format(new Date(), 'yyyy-MM-dd'), description: '', is_recurring: false });
  };

  const moveOpportunity = async (id: string | number, newStatus: Opportunity['status']) => {
    await update(ref(db, `opportunities/${id}`), { status: newStatus });
  };

  // --- Views ---

  const DashboardView = () => {
    const totalIncome = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
    const balance = totalIncome - totalExpense;

    const chartData = [
      { name: 'Entradas', value: totalIncome },
      { name: 'Saídas', value: totalExpense },
    ];

    return (
      <div className="flex flex-col gap-6 p-4 pb-24 md:p-8 max-w-7xl mx-auto">
        <header className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-muted-foreground">Bem-vindo ao seu ERP de Software House.</p>
          </div>
          <Button variant="ghost" onClick={() => setDarkMode(!darkMode)} className="rounded-full p-2 h-auto">
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </Button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-emerald-500">
              <span className="text-sm font-semibold uppercase tracking-wider">Faturamento Total</span>
              <TrendingUp size={20} />
            </div>
            <span className="text-3xl font-bold">R$ {totalIncome.toLocaleString()}</span>
          </Card>
          <Card className="p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-rose-500">
              <span className="text-sm font-semibold uppercase tracking-wider">Despesas Totais</span>
              <TrendingDown size={20} />
            </div>
            <span className="text-3xl font-bold">R$ {totalExpense.toLocaleString()}</span>
          </Card>
          <Card className="p-6 flex flex-col gap-2">
            <div className="flex items-center justify-between text-primary">
              <span className="text-sm font-semibold uppercase tracking-wider">Saldo em Caixa</span>
              <DollarSign size={20} />
            </div>
            <span className={cn("text-3xl font-bold", balance < 0 ? "text-rose-500" : "text-emerald-500")}>
              R$ {balance.toLocaleString()}
            </span>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Fluxo Financeiro</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#10b981' : '#f43f5e'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold mb-4">Projetos Ativos</h3>
            <div className="flex flex-col gap-3">
              {projects.filter(p => p.status === 'active').slice(0, 5).map(project => (
                <div key={project.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                  <div>
                    <p className="font-semibold">{project.name}</p>
                    <p className="text-xs text-muted-foreground">{project.client_name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">R$ {project.budget.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{project.deadline}</p>
                  </div>
                </div>
              ))}
              {projects.filter(p => p.status === 'active').length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum projeto ativo no momento.</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  };

  const CRMView = () => {
    const columns: { id: Opportunity['status'], title: string }[] = [
      { id: 'lead', title: 'Leads' },
      { id: 'proposal', title: 'Proposta' },
      { id: 'negotiation', title: 'Negociação' },
      { id: 'closed_won', title: 'Fechado (Ganho)' },
      { id: 'closed_lost', title: 'Fechado (Perdido)' },
    ];

    return (
      <div className="flex flex-col gap-6 p-4 pb-24 md:p-8 overflow-x-auto">
        <header className="flex justify-between items-center min-w-max md:min-w-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">CRM Kanban</h1>
            <p className="text-muted-foreground">Gerencie suas oportunidades de negócio.</p>
          </div>
          <Button onClick={() => { resetForms(); setModalType('opportunity'); setIsModalOpen(true); }}>
            <Plus size={18} /> Nova Oportunidade
          </Button>
        </header>

        <div className="flex gap-6 min-w-max">
          {columns.map(col => (
            <div key={col.id} className="w-80 flex flex-col gap-4">
              <div className="flex items-center justify-between px-2">
                <h3 className="font-bold text-sm uppercase tracking-widest text-muted-foreground">{col.title}</h3>
                <span className="bg-muted px-2 py-0.5 rounded text-xs font-bold">
                  {opportunities.filter(o => o.status === col.id).length}
                </span>
              </div>
              <div className="kanban-column">
                {opportunities.filter(o => o.status === col.id).map(opp => (
                  <motion.div 
                    layoutId={opp.id.toString()}
                    key={opp.id} 
                    className="kanban-card group"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm">{opp.title}</h4>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEdit('opportunity', opp)} className="text-muted-foreground hover:text-primary p-1 hover:bg-muted rounded">
                          <Edit2 size={14} />
                        </button>
                        <button onClick={() => handleDelete('opportunities', opp.id)} className="text-rose-500 p-1 hover:bg-rose-50 rounded">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{opp.client_name || 'Sem cliente'}</p>
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-sm font-bold text-primary">R$ {opp.value.toLocaleString()}</span>
                      <div className="flex gap-1">
                        {col.id !== 'lead' && (
                          <button 
                            onClick={() => moveOpportunity(opp.id, columns[columns.findIndex(c => c.id === col.id) - 1].id)}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <ChevronLeft size={14} />
                          </button>
                        )}
                        {col.id !== 'closed_lost' && col.id !== 'closed_won' && (
                          <button 
                            onClick={() => moveOpportunity(opp.id, columns[columns.findIndex(c => c.id === col.id) + 1].id)}
                            className="p-1 hover:bg-muted rounded"
                          >
                            <ChevronRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const FinanceView = () => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart);
    const calendarEnd = endOfWeek(monthEnd);
    
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    const monthTransactions = transactions.filter(t => {
      const d = parseISO(t.date);
      return d >= monthStart && d <= monthEnd;
    });

    const income = monthTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
    const expense = monthTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);

    return (
      <div className="flex flex-col gap-6 p-4 pb-24 md:p-8 max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Financeiro</h1>
            <p className="text-muted-foreground">Controle de entradas, saídas e recorrências.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Button onClick={() => { resetForms(); setModalType('transaction'); setIsModalOpen(true); }} className="flex-1 md:flex-none bg-emerald-600 hover:bg-emerald-700">
              <Plus size={18} /> Receita
            </Button>
            <Button onClick={() => { resetForms(); setModalType('transaction'); setTransForm(prev => ({...prev, type: 'expense'})); setIsModalOpen(true); }} className="flex-1 md:flex-none bg-rose-600 hover:bg-rose-700">
              <Plus size={18} /> Despesa
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="p-4 bg-emerald-500/10 border-emerald-500/20">
            <p className="text-xs font-bold uppercase text-emerald-600 mb-1">Entradas no Mês</p>
            <p className="text-2xl font-bold text-emerald-600">R$ {income.toLocaleString()}</p>
          </Card>
          <Card className="p-4 bg-rose-500/10 border-rose-500/20">
            <p className="text-xs font-bold uppercase text-rose-600 mb-1">Saídas no Mês</p>
            <p className="text-2xl font-bold text-rose-600">R$ {expense.toLocaleString()}</p>
          </Card>
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-bold">Calendário Financeiro</h3>
            <div className="flex items-center gap-4">
              <span className="font-semibold">{format(currentMonth, 'MMMM yyyy')}</span>
              <div className="flex gap-1">
                <Button variant="ghost" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-2 h-auto">
                  <ChevronLeft size={20} />
                </Button>
                <Button variant="ghost" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-2 h-auto">
                  <ChevronRight size={20} />
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border border-border">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
              <div key={day} className="bg-muted/50 p-2 text-center text-xs font-bold uppercase text-muted-foreground">
                {day}
              </div>
            ))}
            {days.map(day => {
              const dayTransactions = transactions.filter(t => isSameDay(parseISO(t.date), day));
              const isCurrentMonth = day >= monthStart && day <= monthEnd;
              
              return (
                <div 
                  key={day.toString()} 
                  onClick={() => {
                    if (dayTransactions.length > 0) {
                      setSelectedDayTransactions({ date: day, transactions: dayTransactions });
                    }
                  }}
                  className={cn(
                    "bg-card min-h-[80px] md:min-h-[100px] p-2 flex flex-col gap-1 transition-colors hover:bg-muted/20 cursor-pointer",
                    !isCurrentMonth && "opacity-30"
                  )}
                >
                  <span className="text-xs font-medium">{format(day, 'd')}</span>
                  <div className="flex flex-col gap-1">
                    {dayTransactions.slice(0, 3).map(t => (
                      <div 
                        key={t.id} 
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded truncate font-medium hidden md:block",
                          t.type === 'income' ? "bg-emerald-500/20 text-emerald-600" : "bg-rose-500/20 text-rose-600"
                        )}
                      >
                        {t.type === 'income' ? '+' : '-'} {t.amount.toLocaleString()}
                      </div>
                    ))}
                    {dayTransactions.length > 0 && (
                      <div className="md:hidden flex flex-wrap gap-1">
                        {dayTransactions.map(t => (
                          <div 
                            key={t.id}
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              t.type === 'income' ? "bg-emerald-500" : "bg-rose-500"
                            )}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Transações Recentes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3">Categoria</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {transactions.slice(0, 10).map(t => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">{t.date}</td>
                    <td className="px-4 py-3 font-medium">{t.description}</td>
                    <td className="px-4 py-3">
                      <span className="bg-muted px-2 py-0.5 rounded text-xs">{t.category}</span>
                    </td>
                    <td className={cn("px-4 py-3 font-bold", t.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                      {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => handleEdit('transaction', t)} className="text-muted-foreground hover:text-primary transition-colors">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete('transactions', t.id)} className="text-muted-foreground hover:text-rose-500 transition-colors">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  const ProjectsView = () => (
    <div className="flex flex-col gap-6 p-4 pb-24 md:p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projetos</h1>
          <p className="text-muted-foreground">Acompanhe o desenvolvimento da sua software house.</p>
        </div>
        <Button onClick={() => { resetForms(); setModalType('project'); setIsModalOpen(true); }}>
          <Plus size={18} /> Novo Projeto
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {projects.map(project => (
          <Card key={project.id} className="p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold">{project.name}</h3>
                <p className="text-sm text-muted-foreground">{project.client_name}</p>
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                project.status === 'active' ? "bg-emerald-500/10 text-emerald-600" : 
                project.status === 'completed' ? "bg-blue-500/10 text-blue-600" : "bg-amber-500/10 text-amber-600"
              )}>
                {project.status}
              </span>
            </div>
            
            <div className="grid grid-cols-2 gap-4 py-2 border-y border-border">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Orçamento</p>
                <p className="font-bold">R$ {project.budget.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Prazo</p>
                <p className="font-bold">{project.deadline}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <Button variant="ghost" onClick={() => handleEdit('project', project)} className="text-muted-foreground hover:text-primary p-2 h-auto">
                <Edit2 size={18} />
              </Button>
              <Button variant="ghost" onClick={() => handleDelete('projects', project.id)} className="text-rose-500 hover:bg-rose-50 p-2 h-auto">
                <Trash2 size={18} />
              </Button>
              <Button variant="secondary" className="text-xs px-3 py-1">Detalhes</Button>
            </div>
          </Card>
        ))}
        {projects.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <Briefcase className="mx-auto text-muted mb-4" size={48} />
            <p className="text-muted-foreground">Nenhum projeto cadastrado.</p>
          </div>
        )}
      </div>
    </div>
  );

  const ClientsView = () => (
    <div className="flex flex-col gap-6 p-4 pb-24 md:p-8 max-w-7xl mx-auto">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Base de dados de clientes e parceiros.</p>
        </div>
        <Button onClick={() => { resetForms(); setModalType('client'); setIsModalOpen(true); }}>
          <Plus size={18} /> Novo Cliente
        </Button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {clients.map(client => (
          <Card key={client.id} className="p-6 flex flex-col gap-4 group">
            <div className="flex justify-between items-start">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xl">
                {client.name.charAt(0)}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button onClick={() => handleEdit('client', client)} className="text-muted-foreground p-2 hover:bg-muted rounded-full transition-all">
                  <Edit2 size={18} />
                </button>
                <button onClick={() => handleDelete('clients', client.id)} className="text-rose-500 p-2 hover:bg-rose-50 rounded-full transition-all">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
            <div>
              <h3 className="text-lg font-bold">{client.name}</h3>
              <p className="text-sm text-muted-foreground">{client.company || 'Pessoa Física'}</p>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={14} />
                <span>{client.email}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={14} />
                <span>{client.phone}</span>
              </div>
            </div>
          </Card>
        ))}
        {clients.length === 0 && (
          <div className="col-span-full py-20 text-center">
            <Users className="mx-auto text-muted mb-4" size={48} />
            <p className="text-muted-foreground">Nenhum cliente cadastrado.</p>
          </div>
        )}
      </div>
    </div>
  );

  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div 
          animate={{ rotate: 360 }} 
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 flex flex-col items-center gap-6 text-center text-foreground">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-primary-foreground shadow-xl shadow-primary/20">
            <LayoutDashboard size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SoftERP</h1>
            <p className="text-muted-foreground mt-1">Acesse o ERP da sua Software House</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-6 text-lg gap-3">
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Entrar com Google
          </Button>
          <p className="text-xs text-muted-foreground">
            Acesso restrito aos administradores autorizados.
          </p>
        </Card>
      </div>
    );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 flex flex-col items-center gap-6 text-center text-foreground">
          <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-600">
            <Lock size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Acesso Negado</h1>
            <p className="text-muted-foreground mt-1">Seu email ({user.email}) não está na lista de acesso.</p>
          </div>
          <Button variant="secondary" onClick={handleLogout} className="w-full">
            Sair e tentar outra conta
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-card border-r border-border hidden lg:flex flex-col p-6 gap-8 z-40">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground">
            <LayoutDashboard size={20} />
          </div>
          <span className="font-bold text-xl tracking-tight">SoftERP</span>
        </div>

        <nav className="flex flex-col gap-2">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
            { id: 'crm', icon: Trello, label: 'CRM Kanban' },
            { id: 'finance', icon: DollarSign, label: 'Financeiro' },
            { id: 'projects', icon: Briefcase, label: 'Projetos' },
            { id: 'clients', icon: Users, label: 'Clientes' },
          ].map((item) => (
            <button 
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={cn(
                "relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
                activeTab === item.id ? "text-primary-foreground" : "hover:bg-muted text-muted-foreground"
              )}
            >
              {activeTab === item.id && (
                <motion.div 
                  layoutId="sidebar-nav-pill"
                  className="absolute inset-0 bg-primary rounded-xl -z-10 shadow-lg shadow-primary/20"
                  transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                />
              )}
              <item.icon size={20} className={cn("transition-transform group-hover:scale-110", activeTab === item.id && "scale-110")} />
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-xl">
            <img src={user?.photoURL || ''} className="w-8 h-8 rounded-full border border-border" alt="Avatar" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold truncate">{user?.displayName}</span>
              <span className="text-[10px] text-muted-foreground truncate">{user?.email}</span>
            </div>
            <button onClick={handleLogout} className="ml-auto text-muted-foreground hover:text-rose-500 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
          <Card className="p-4 bg-primary/5 border-primary/10">
            <p className="text-xs font-bold uppercase text-primary mb-1">Suporte Premium</p>
            <p className="text-xs text-muted-foreground mb-3">Precisa de ajuda com seu ERP?</p>
            <Button className="w-full text-xs py-2">Falar com Consultor</Button>
          </Card>
        </div>
      </aside>

      {/* Main Content */}
      <main className="lg:pl-64 min-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <DashboardView />}
            {activeTab === 'crm' && <CRMView />}
            {activeTab === 'finance' && <FinanceView />}
            {activeTab === 'projects' && <ProjectsView />}
            {activeTab === 'clients' && <ClientsView />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Mobile Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border h-20 px-4 flex items-center justify-around lg:hidden z-50">
        {[
          { id: 'dashboard', icon: LayoutDashboard, label: 'Início' },
          { id: 'crm', icon: Trello, label: 'CRM' },
          { id: 'finance', icon: DollarSign, label: 'Money' },
          { id: 'projects', icon: Briefcase, label: 'Projetos' },
          { id: 'clients', icon: Users, label: 'Clientes' },
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => setActiveTab(item.id as any)} 
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 w-16 h-16 transition-colors",
              activeTab === item.id ? "text-primary" : "text-muted-foreground"
            )}
          >
            {activeTab === item.id && (
              <motion.div 
                layoutId="mobile-nav-pill"
                className="absolute inset-0 bg-primary/10 rounded-xl -z-10"
                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
              />
            )}
            <motion.div
              animate={{ 
                scale: activeTab === item.id ? 1.1 : 1,
                y: activeTab === item.id ? -2 : 0
              }}
            >
              <item.icon size={24} />
            </motion.div>
            <span className="text-[10px] font-bold uppercase tracking-tighter">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Floating Action Button (Mobile) */}
      <div className="fixed bottom-24 right-6 lg:hidden z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {isFabOpen && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              className="flex flex-col items-end gap-2 mb-2"
            >
              {[
                { label: 'Transação', icon: DollarSign, color: 'bg-emerald-600', onClick: () => { resetForms(); setModalType('transaction'); setIsModalOpen(true); } },
                { label: 'Projeto', icon: Briefcase, color: 'bg-blue-600', onClick: () => { resetForms(); setModalType('project'); setIsModalOpen(true); } },
                { label: 'Oportunidade', icon: Trello, color: 'bg-amber-600', onClick: () => { resetForms(); setModalType('opportunity'); setIsModalOpen(true); } },
                { label: 'Cliente', icon: Users, color: 'bg-indigo-600', onClick: () => { resetForms(); setModalType('client'); setIsModalOpen(true); } },
              ].map((action, i) => (
                <motion.button
                  key={action.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => { action.onClick(); setIsFabOpen(false); }}
                  className="flex items-center gap-2 bg-card border border-border px-3 py-2 rounded-full shadow-lg"
                >
                  <span className="text-xs font-bold uppercase tracking-wider">{action.label}</span>
                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center text-white", action.color)}>
                    <action.icon size={16} />
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsFabOpen(!isFabOpen)}
          className="w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-2xl flex items-center justify-center"
        >
          <motion.div animate={{ rotate: isFabOpen ? 45 : 0 }}>
            <Plus size={28} />
          </motion.div>
        </motion.button>
      </div>

      {/* Day Details Modal */}
      <Modal 
        isOpen={!!selectedDayTransactions} 
        onClose={() => setSelectedDayTransactions(null)} 
        title={selectedDayTransactions ? `Transações - ${format(selectedDayTransactions.date, 'dd/MM/yyyy')}` : ''}
      >
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-2">
          {selectedDayTransactions?.transactions.map(t => (
            <div key={t.id} className="flex items-center justify-between p-4 bg-muted/30 rounded-xl border border-border">
              <div className="flex flex-col">
                <span className="font-bold text-sm">{t.description}</span>
                <span className="text-xs text-muted-foreground">{t.category}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className={cn("font-bold", t.type === 'income' ? "text-emerald-600" : "text-rose-600")}>
                  {t.type === 'income' ? '+' : '-'} R$ {t.amount.toLocaleString()}
                </span>
                <div className="flex gap-2 mt-1">
                  <button 
                    onClick={() => { 
                      handleEdit('transaction', t); 
                      setSelectedDayTransactions(null); 
                    }} 
                    className="text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button 
                    onClick={() => { 
                      handleDelete('transactions', t.id); 
                      setSelectedDayTransactions(null); 
                    }} 
                    className="text-rose-500 hover:text-rose-600 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {selectedDayTransactions?.transactions.length === 0 && (
            <p className="text-center text-muted-foreground py-4">Nenhuma transação neste dia.</p>
          )}
        </div>
      </Modal>

      {/* Modals */}
      <Modal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); resetForms(); }} 
        title={
          modalType === 'client' ? (editingId ? 'Editar Cliente' : 'Novo Cliente') : 
          modalType === 'opportunity' ? (editingId ? 'Editar Oportunidade' : 'Nova Oportunidade') : 
          modalType === 'project' ? (editingId ? 'Editar Projeto' : 'Novo Projeto') : 
          (editingId ? 'Editar Transação' : 'Nova Transação')
        }
      >
        <div className="flex flex-col gap-4">
          {modalType === 'client' && (
            <>
              <Input label="Nome" value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} placeholder="Ex: João Silva" />
              <Input label="Email" value={clientForm.email} onChange={e => setClientForm({...clientForm, email: e.target.value})} placeholder="joao@email.com" />
              <Input label="Telefone" value={clientForm.phone} onChange={e => setClientForm({...clientForm, phone: e.target.value})} placeholder="(11) 99999-9999" />
              <Input label="Empresa" value={clientForm.company} onChange={e => setClientForm({...clientForm, company: e.target.value})} placeholder="Ex: Google" />
            </>
          )}
          {modalType === 'opportunity' && (
            <>
              <Input label="Título" value={oppForm.title} onChange={e => setOppForm({...oppForm, title: e.target.value})} placeholder="Ex: Desenvolvimento Web" />
              <Select 
                label="Cliente" 
                value={oppForm.client_id} 
                onChange={e => setOppForm({...oppForm, client_id: e.target.value})}
                options={[{ value: '', label: 'Selecione um cliente' }, ...clients.map(c => ({ value: c.id.toString(), label: c.name }))]} 
              />
              <Input label="Valor (R$)" type="number" value={oppForm.value} onChange={e => setOppForm({...oppForm, value: e.target.value})} placeholder="0.00" />
              <Select 
                label="Status" 
                value={oppForm.status} 
                onChange={e => setOppForm({...oppForm, status: e.target.value as any})}
                options={[
                  { value: 'lead', label: 'Lead' },
                  { value: 'proposal', label: 'Proposta' },
                  { value: 'negotiation', label: 'Negociação' },
                  { value: 'closed_won', label: 'Fechado (Ganho)' },
                  { value: 'closed_lost', label: 'Fechado (Perdido)' },
                ]} 
              />
              <Input label="Descrição" value={oppForm.description} onChange={e => setOppForm({...oppForm, description: e.target.value})} placeholder="Detalhes da oportunidade..." />
            </>
          )}
          {modalType === 'project' && (
            <>
              <Input label="Nome do Projeto" value={projectForm.name} onChange={e => setProjectForm({...projectForm, name: e.target.value})} placeholder="Ex: App Mobile" />
              <Select 
                label="Cliente" 
                value={projectForm.client_id} 
                onChange={e => setProjectForm({...projectForm, client_id: e.target.value})}
                options={[{ value: '', label: 'Selecione um cliente' }, ...clients.map(c => ({ value: c.id.toString(), label: c.name }))]} 
              />
              <Input label="Orçamento (R$)" type="number" value={projectForm.budget} onChange={e => setProjectForm({...projectForm, budget: e.target.value})} placeholder="0.00" />
              <Input label="Prazo" type="date" value={projectForm.deadline} onChange={e => setProjectForm({...projectForm, deadline: e.target.value})} />
              <Select 
                label="Status" 
                value={projectForm.status} 
                onChange={e => setProjectForm({...projectForm, status: e.target.value as any})}
                options={[
                  { value: 'active', label: 'Ativo' },
                  { value: 'completed', label: 'Concluído' },
                  { value: 'on_hold', label: 'Em espera' },
                ]} 
              />
            </>
          )}
          {modalType === 'transaction' && (
            <>
              <Select 
                label="Tipo" 
                value={transForm.type} 
                onChange={e => setTransForm({...transForm, type: e.target.value as any})}
                options={[
                  { value: 'income', label: 'Entrada (Receita)' },
                  { value: 'expense', label: 'Saída (Despesa)' },
                ]} 
              />
              <Input label="Descrição" value={transForm.description} onChange={e => setTransForm({...transForm, description: e.target.value})} placeholder="Ex: Pagamento Projeto X" />
              <Input label="Categoria" value={transForm.category} onChange={e => setTransForm({...transForm, category: e.target.value})} placeholder="Ex: Consultoria, Servidores, etc." />
              <Input label="Valor (R$)" type="number" value={transForm.amount} onChange={e => setTransForm({...transForm, amount: e.target.value})} placeholder="0.00" />
              <Input label="Data" type="date" value={transForm.date} onChange={e => setTransForm({...transForm, date: e.target.value})} />
              <div className="flex items-center gap-2 py-2">
                <input 
                  type="checkbox" 
                  id="recurring" 
                  checked={transForm.is_recurring} 
                  onChange={e => setTransForm({...transForm, is_recurring: e.target.checked})}
                  className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                />
                <label htmlFor="recurring" className="text-sm font-medium">Despesa/Receita Recorrente</label>
              </div>
            </>
          )}
          <div className="flex gap-3 mt-4">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)} className="flex-1">Cancelar</Button>
            <Button onClick={handleAdd} className="flex-1">Salvar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
