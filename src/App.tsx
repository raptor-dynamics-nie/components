import React, { useState, useEffect } from 'react';
import { 
  Plus, Search, ChevronLeft, Clock, 
  ArrowRightLeft, CheckCircle2, Box, Trash2, ChevronUp, User, Phone, FileText
} from 'lucide-react';
import { supabase } from './supabase';

interface BorrowRecord {
  id: string;
  borrower: string;
  contactNumber: string;
  reason: string;
  dateBorrowed: string;
  dateReturned: string | null;
}

interface ComponentInstance {
  id: string;
  serialNumber: string;
  history: BorrowRecord[];
}

interface ComponentCategory {
  id: string;
  name: string;
  instances: ComponentInstance[];
}

function App() {
  const [categories, setCategories] = useState<ComponentCategory[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(true);
  
  // Navigation State
  const [view, setView] = useState<'dashboard' | 'detail'>('dashboard');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'available' | 'borrowed'>('all');
  
  // Expansion State for History
  const [expandedInstanceId, setExpandedInstanceId] = useState<string | null>(null);
  
  // Modals
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddInstanceModal, setShowAddInstanceModal] = useState(false);
  const [showBorrowModal, setShowBorrowModal] = useState(false);
  
  // Forms
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSerialNumber, setNewSerialNumber] = useState('');
  
  const [selectedInstanceForBorrow, setSelectedInstanceForBorrow] = useState<string | null>(null);
  const [borrowerName, setBorrowerName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [borrowReason, setBorrowReason] = useState('');

  const loadCategories = async () => {
    const { data, error } = await supabase
      .from('components')
      .select('id, name, instances')
      .order('name', { ascending: true });

    if (error) {
      console.error('Error fetching components:', error);
      setLoading(false);
      setSyncing(false);
      return;
    }

    const mappedCategories: ComponentCategory[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name || 'Unnamed Category',
      instances: Array.isArray(row.instances) ? row.instances : []
    }));

    setCategories(mappedCategories);
    setLoading(false);
    setSyncing(false);
  };

  // Fetch data from Firebase Real-time
  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 500);
    loadCategories();

    const channel = supabase
      .channel('components-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'components' }, () => {
        loadCategories();
      })
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, []);

  // --- ACTIONS ---

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedName = newCategoryName.trim();
    if (!normalizedName) return;
    
    const newId = Date.now().toString();
    const newCat: ComponentCategory = {
      id: newId,
      name: normalizedName,
      instances: []
    };
    
    setShowAddCategoryModal(false);
    setNewCategoryName('');
    
    try {
      const { error } = await supabase.from('components').upsert(newCat, { onConflict: 'id' });
      if (error) throw error;
      setSelectedCategoryId(newId);
      setView('detail');
    } catch (e: any) {
      alert("Error saving category: " + e.message);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (window.confirm("Are you sure you want to delete this entire category and all its serial numbers? This cannot be undone.")) {
      setView('dashboard');
      try {
        const { error } = await supabase.from('components').delete().eq('id', catId);
        if (error) throw error;
      } catch (e: any) {
        alert("Error deleting category: " + e.message);
      }
    }
  };

  const handleAddInstance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId || !newSerialNumber) return;

    const category = categories.find(c => c.id === selectedCategoryId);
    if (!category) return;

    // Check if serial number already exists in this category
    if (category.instances.some(i => i.serialNumber.toLowerCase() === newSerialNumber.toLowerCase())) {
      alert("This serial number already exists in this category!");
      return;
    }

    const newInstance: ComponentInstance = {
      id: Date.now().toString(),
      serialNumber: newSerialNumber,
      history: []
    };

    const updatedCategory = {
      ...category,
      instances: [...category.instances, newInstance]
    };

    setShowAddInstanceModal(false);
    setNewSerialNumber('');

    try {
      const { error } = await supabase.from('components').upsert(updatedCategory, { onConflict: 'id' });
      if (error) throw error;
    } catch (e: any) {
      alert("Error saving serial number: " + e.message);
    }
  };

  const handleDeleteInstance = async (instanceId: string) => {
    if (!selectedCategoryId) return;
    if (!window.confirm("Delete this serial number? All borrowing history for this item will be lost.")) return;

    const category = categories.find(c => c.id === selectedCategoryId);
    if (!category) return;

    const updatedCategory = {
      ...category,
      instances: category.instances.filter(i => i.id !== instanceId)
    };

    try {
      const { error } = await supabase.from('components').upsert(updatedCategory, { onConflict: 'id' });
      if (error) throw error;
    } catch (e: any) {
      alert("Error deleting serial number: " + e.message);
    }
  };

  const handleBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategoryId || !selectedInstanceForBorrow || !borrowerName || !contactNumber || !borrowReason) return;
    
    const category = categories.find(c => c.id === selectedCategoryId);
    if (!category) return;

    const newHistory: BorrowRecord = {
      id: Date.now().toString(),
      borrower: borrowerName,
      contactNumber: contactNumber,
      reason: borrowReason,
      dateBorrowed: new Date().toISOString(),
      dateReturned: null
    };

    const updatedInstances = category.instances.map(inst => {
      if (inst.id === selectedInstanceForBorrow) {
        return { ...inst, history: [newHistory, ...inst.history] };
      }
      return inst;
    });

    const updatedCategory = { ...category, instances: updatedInstances };

    setShowBorrowModal(false);
    setSelectedInstanceForBorrow(null);
    setBorrowerName('');
    setContactNumber('');
    setBorrowReason('');

    try {
      const { error } = await supabase.from('components').upsert(updatedCategory, { onConflict: 'id' });
      if (error) throw error;
    } catch (e: any) {
      alert("Failed to check-out: " + e.message);
    }
  };

  const handleReturn = async (instanceId: string) => {
    if (!selectedCategoryId) return;
    const category = categories.find(c => c.id === selectedCategoryId);
    if (!category) return;

    const updatedInstances = category.instances.map(inst => {
      if (inst.id === instanceId) {
        const updatedHistory = inst.history.map(h => 
          h.dateReturned === null ? { ...h, dateReturned: new Date().toISOString() } : h
        );
        return { ...inst, history: updatedHistory };
      }
      return inst;
    });

    const updatedCategory = { ...category, instances: updatedInstances };

    try {
      const { error } = await supabase.from('components').upsert(updatedCategory, { onConflict: 'id' });
      if (error) throw error;
    } catch (e: any) {
      alert("Failed to check-in: " + e.message);
    }
  };

  // --- HELPERS ---

  const isInstanceBorrowed = (inst: ComponentInstance) => inst.history.length > 0 && inst.history[0].dateReturned === null;
  
  const getCategoryStats = (cat: ComponentCategory) => {
    const total = cat.instances.length;
    const borrowed = cat.instances.filter(isInstanceBorrowed).length;
    const available = total - borrowed;
    return { total, available, borrowed };
  };

  // Filter Categories for Dashboard
  const filteredCategories = categories.filter(cat => {
    // Search match
    if (search && !cat.name.toLowerCase().includes(search.toLowerCase())) {
      // Also search within serial numbers
      const matchesSerial = cat.instances.some(i => i.serialNumber.toLowerCase().includes(search.toLowerCase()));
      if (!matchesSerial) return false;
    }
    
    // Tab match
    const stats = getCategoryStats(cat);
    if (tab === 'available' && stats.available === 0) return false;
    if (tab === 'borrowed' && stats.borrowed === 0) return false;
    
    return true;
  });

  const selectedCategory = categories.find(c => c.id === selectedCategoryId);
  const selectedCategoryStats = selectedCategory ? getCategoryStats(selectedCategory) : null;
  const availableInstances = selectedCategory ? selectedCategory.instances.filter(inst => !isInstanceBorrowed(inst)) : [];
  const borrowedInstances = selectedCategory ? selectedCategory.instances.filter(isInstanceBorrowed) : [];

  const renderInstanceCard = (inst: ComponentInstance) => {
    const isBorrowed = isInstanceBorrowed(inst);
    const isExpanded = expandedInstanceId === inst.id;
    const currentBorrower = isBorrowed ? inst.history[0] : null;

    return (
      <div key={inst.id} className="glass-panel" style={{ overflow: 'hidden', borderLeft: `4px solid ${isBorrowed ? 'var(--warning)' : 'var(--success)'}` }}>
        {/* Unit Header Row */}
        <div style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Serial No.</span>
              <div style={{ fontSize: '1.2rem', fontFamily: 'monospace', fontWeight: 'bold' }}>{inst.serialNumber}</div>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span className={`status-tag ${isBorrowed ? 'status-borrowed' : 'status-available'}`} style={{ alignSelf: 'flex-start' }}>
                {isBorrowed ? 'Currently Borrowed' : 'Available'}
              </span>
              {isBorrowed && currentBorrower && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    by <strong>{currentBorrower.borrower}</strong>
                  </span>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Phone size={12} /> {currentBorrower.contactNumber || 'N/A'}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {isBorrowed ? (
              <button className="btn" style={{ background: 'var(--success)', color: '#000', padding: '6px 12px', fontSize: '0.9rem' }} onClick={() => handleReturn(inst.id)}>
                <CheckCircle2 size={16} /> Check-in
              </button>
            ) : (
              <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.9rem' }} onClick={() => {
                setSelectedInstanceForBorrow(inst.id);
                setShowBorrowModal(true);
              }}>
                <ArrowRightLeft size={16} /> Check-out
              </button>
            )}
            
            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px', background: 'transparent' }} 
              title="Delete Unit"
              onClick={() => handleDeleteInstance(inst.id)}
            >
              <Trash2 size={16} color="var(--danger)" />
            </button>

            <button 
              className="btn btn-secondary" 
              style={{ padding: '6px 12px', fontSize: '0.9rem', width: '130px', justifyContent: 'center' }}
              onClick={() => setExpandedInstanceId(isExpanded ? null : inst.id)}
            >
              {isExpanded ? <><ChevronUp size={16} /> Hide History</> : <><Clock size={16} /> View History</>}
            </button>
          </div>
        </div>

        {/* Expandable History Section */}
        {isExpanded && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '800px' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Borrower</th>
                    <th style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Contact</th>
                    <th style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Reason</th>
                    <th style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Borrowed At</th>
                    <th style={{ padding: '12px 20px', color: 'var(--text-secondary)', fontWeight: 500, fontSize: '0.85rem' }}>Returned At</th>
                  </tr>
                </thead>
                <tbody>
                  {inst.history.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        No records for this specific unit.
                      </td>
                    </tr>
                  ) : (
                    inst.history.map(record => (
                      <tr key={record.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', fontSize: '0.9rem' }}>
                        <td style={{ padding: '12px 20px', fontWeight: 500 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><User size={14} color="var(--text-secondary)" /> {record.borrower}</div>
                        </td>
                        <td style={{ padding: '12px 20px', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Phone size={14} /> {record.contactNumber || 'N/A'}</div>
                        </td>
                        <td style={{ padding: '12px 20px', color: 'var(--text-secondary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><FileText size={14} /> {record.reason}</div>
                        </td>
                        <td style={{ padding: '12px 20px', color: 'var(--text-muted)' }}>{new Date(record.dateBorrowed).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'})}</td>
                        <td style={{ padding: '12px 20px', color: record.dateReturned ? 'var(--text-primary)' : 'var(--warning)' }}>
                          {record.dateReturned ? new Date(record.dateReturned).toLocaleString(undefined, {dateStyle: 'short', timeStyle: 'short'}) : 'Pending Return'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  // --- RENDER ---

  if (loading) {
    return <div style={{display:'flex', height:'100vh', justifyContent:'center', alignItems:'center'}}>
      <h2 className="text-gradient">Connecting to Raptor Cloud...</h2>
    </div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      
      {/* HEADER */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '8px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src="/logo.png" alt="Raptor Dynamics" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Raptor Dynamics</h1>
              {syncing && <span style={{ fontSize: '0.7rem', color: 'var(--warning)', background: 'rgba(255,204,0,0.1)', padding: '2px 8px', borderRadius: '12px' }}>Connecting...</span>}
            </div>
            <span style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', letterSpacing: '2px', textTransform: 'uppercase' }}>Inventory System</span>
          </div>
        </div>
      </header>

      {/* DASHBOARD VIEW */}
      {view === 'dashboard' && (
        <div className="animate-fade-in">
          
          {/* Toolbar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            
            {/* Tabs */}
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '4px', gap: '4px' }}>
              {(['all', 'available', 'borrowed'] as const).map(t => (
                <button 
                  key={t}
                  onClick={() => setTab(t)}
                  style={{ 
                    padding: '8px 16px', 
                    borderRadius: '6px', 
                    border: 'none',
                    background: tab === t ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: tab === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    fontWeight: tab === t ? 600 : 400,
                    transition: 'all 0.2s'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1, justifyContent: 'flex-end' }}>
              <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
                <Search style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-secondary)' }} size={18} />
                <input 
                  type="text" 
                  placeholder="Search components or serials..." 
                  className="input-field"
                  style={{ width: '100%', paddingLeft: '40px', paddingRight: '12px', paddingTop: '10px', paddingBottom: '10px' }}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <button className="btn btn-primary" onClick={() => setShowAddCategoryModal(true)} style={{ padding: '10px 16px' }}>
                <Plus size={18} /> New Component
              </button>
            </div>
          </div>

          {/* Categories Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
            {filteredCategories.length === 0 && (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', color: 'var(--text-secondary)' }}>
                <Box size={48} style={{ margin: '0 auto 16px', opacity: 0.5 }} />
                <h3>No inventory found</h3>
                <p>Try adjusting your filters or add a new component.</p>
              </div>
            )}
            
            {filteredCategories.map(cat => {
              const stats = getCategoryStats(cat);
              const hasAvailable = stats.available > 0;
              const hasBorrowed = stats.borrowed > 0;

              return (
                <div 
                  key={cat.id} 
                  className="glass-panel" 
                  style={{ 
                    padding: '20px', 
                    cursor: 'pointer', 
                    transition: 'transform 0.2s', 
                    borderTop: `3px solid ${stats.total === 0 ? 'var(--border-color)' : hasAvailable ? 'var(--success)' : 'var(--warning)'}` 
                  }}
                  onClick={() => {
                    setSelectedCategoryId(cat.id);
                    setView('detail');
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-4px)'}
                  onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '1.3rem', margin: 0 }}>{cat.name}</h3>
                    <span style={{ 
                      fontSize: '0.8rem', 
                      background: 'rgba(255,255,255,0.05)', 
                      padding: '4px 10px', 
                      borderRadius: '12px',
                      color: 'var(--text-secondary)'
                    }}>
                      {stats.total} {stats.total === 1 ? 'Item' : 'Items'}
                    </span>
                  </div>
                  
                  {stats.total > 0 ? (
                    <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasAvailable ? 'var(--success)' : 'var(--text-muted)' }}>
                        <CheckCircle2 size={16} /> {stats.available} Available
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: hasBorrowed ? 'var(--warning)' : 'var(--text-muted)' }}>
                        <ArrowRightLeft size={16} /> {stats.borrowed} Borrowed
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      No items registered in this component yet.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DETAIL VIEW */}
      {view === 'detail' && selectedCategory && (
        <div className="animate-fade-in">
          <button 
            className="btn btn-secondary" 
            style={{ marginBottom: '24px', padding: '8px 16px' }}
            onClick={() => {
              setView('dashboard');
              setExpandedInstanceId(null);
            }}
          >
            <ChevronLeft size={18} /> Back to Dashboard
          </button>

          {/* Component Header */}
          <div className="glass-panel" style={{ padding: '30px', marginBottom: '30px', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <span style={{ color: 'var(--accent-primary)', fontSize: '0.9rem', letterSpacing: '1px', textTransform: 'uppercase' }}>Component</span>
                <h2 style={{ fontSize: '2.5rem', margin: '4px 0 12px 0' }}>{selectedCategory.name}</h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', color: 'var(--text-secondary)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Box size={16} /> {selectedCategory.instances.length} Total Units</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--success)' }}><CheckCircle2 size={16} /> {selectedCategoryStats?.available ?? 0} Available in Club</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--warning)' }}><ArrowRightLeft size={16} /> {selectedCategoryStats?.borrowed ?? 0} Borrowed</span>
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button 
                  className="btn btn-danger" 
                  onClick={() => handleDeleteCategory(selectedCategory.id)}
                  title="Delete Component"
                >
                  <Trash2 size={18} /> Delete Component
                </button>
                <button className="btn btn-primary" onClick={() => setShowAddInstanceModal(true)}>
                  <Plus size={18} /> Add Serial Number
                </button>
              </div>
            </div>
          </div>

          <h3 style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Box size={20} className="text-gradient" /> Inventory Units (Serial Numbers)
          </h3>

          {/* Serial Numbers List */}
          {selectedCategory.instances.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>No serial numbers added to this component yet.</p>
              <button className="btn btn-primary" style={{ margin: '15px auto 0' }} onClick={() => setShowAddInstanceModal(true)}>
                <Plus size={18} /> Register First Unit
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
              <div>
                <h4 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)' }}>
                  <CheckCircle2 size={16} /> Available In Club ({availableInstances.length})
                </h4>
                {availableInstances.length === 0 ? (
                  <div className="glass-panel" style={{ padding: '18px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No available serial numbers right now.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {availableInstances.map(renderInstanceCard)}
                  </div>
                )}
              </div>

              <div>
                <h4 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--warning)' }}>
                  <ArrowRightLeft size={16} /> Borrowed Components ({borrowedInstances.length})
                </h4>
                {borrowedInstances.length === 0 ? (
                  <div className="glass-panel" style={{ padding: '18px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No borrowed serial numbers at the moment.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {borrowedInstances.map(renderInstanceCard)}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODALS */}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
            <h2 style={{ marginBottom: '8px' }}>Add Component</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Create a component (e.g. "Simulator"). Then open it to add serial numbers like SIM01, SIM02, etc.</p>
            <form onSubmit={handleAddCategory}>
              <div className="input-group" style={{ marginBottom: '30px' }}>
                <label>Component Name</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Simulator" 
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  required 
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddCategoryModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Component</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Serial Number Modal */}
      {showAddInstanceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '30px' }}>
            <h2 style={{ marginBottom: '8px' }}>Register New Unit</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>Enter the unique identifier or serial number for this specific piece of hardware.</p>
            <form onSubmit={handleAddInstance}>
              <div className="input-group" style={{ marginBottom: '30px' }}>
                <label>Serial Number / ID</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. SIM01, SIM02" 
                  value={newSerialNumber}
                  onChange={e => setNewSerialNumber(e.target.value)}
                  required 
                  autoFocus
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddInstanceModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Unit</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Borrow Modal */}
      {showBorrowModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '450px', padding: '30px' }}>
            <h2 style={{ marginBottom: '20px' }}>Check-out Unit</h2>
            <form onSubmit={handleBorrow}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                <div className="input-group">
                  <label>Borrower Name</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Full name" 
                    value={borrowerName}
                    onChange={e => setBorrowerName(e.target.value)}
                    required 
                    autoFocus
                  />
                </div>
                <div className="input-group">
                  <label>Contact Number</label>
                  <input 
                    type="tel" 
                    className="input-field" 
                    placeholder="Phone / WhatsApp" 
                    value={contactNumber}
                    onChange={e => setContactNumber(e.target.value)}
                    required 
                  />
                </div>
              </div>
              <div className="input-group" style={{ marginBottom: '30px', marginTop: '15px' }}>
                <label>Reason for Borrowing</label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Flight Testing, Repair" 
                  value={borrowReason}
                  onChange={e => setBorrowReason(e.target.value)}
                  required 
                />
              </div>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => {
                  setShowBorrowModal(false);
                  setSelectedInstanceForBorrow(null);
                }}>Cancel</button>
                <button type="submit" className="btn btn-primary">Confirm Check-out</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
