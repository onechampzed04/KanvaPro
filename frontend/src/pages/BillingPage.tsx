import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Download, CheckCircle, Clock, ChevronDown, ChevronUp, CalendarDays, Package, CreditCard, Sparkles } from 'lucide-react';
import { fetchActiveSubscriptions } from '../api/api';

export default function BillingPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/payments/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const validHistory = (data.history || []).filter((item: any) => item.status?.toLowerCase() !== 'pending');
        setHistory(validHistory);
      } catch (err) {
        console.error("Lỗi lấy lịch sử thanh toán", err);
      }
    };
    
    const loadPlans = async () => {
      try {
        const data = await fetchActiveSubscriptions();
        setPlans(data.subscriptions || data.plans || data || []);
      } catch (error) {
        console.error("Lỗi tải thông tin gói cước:", error);
      }
    };

    fetchHistory();
    loadPlans();
  }, []);

  const handleDownloadInvoice = async (invoice: any) => {
    setSelectedInvoice(invoice);
    setIsGenerating(true);
    // Đợi DOM render xong Hóa đơn, sau đó gọi lệnh In của trình duyệt
    setTimeout(() => {
      window.print();
      setIsGenerating(false);
    }, 500);
  };

  const toggleRow = (id: string) => {
    if (expandedRowId === id) setExpandedRowId(null);
    else setExpandedRowId(id);
  };

  const calculateEndDate = (startDateString: string) => {
    const date = new Date(startDateString);
    date.setDate(date.getDate() + 30);
    return date;
  };

  const getRemainingDaysText = (startDateString: string) => {
    const end = calculateEndDate(startDateString);
    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return "Đã hết hạn";
    if (diffDays === 0) return "Hết hạn hôm nay";
    return `Còn ${diffDays} ngày`;
  };

  const getPlanFeatures = (planName: string) => {
    const plan = plans.find(p => p.name === planName);
    if (!plan || !plan.features) return null;
    let featuresList: string[] = [];
    if (typeof plan.features === 'string') {
      try { featuresList = JSON.parse(plan.features); } catch(e) {}
    } else if (Array.isArray(plan.features)) {
      featuresList = plan.features;
    }
    return featuresList;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans relative">
      {/* KHU VỰC HIỂN THỊ CHÍNH (Sẽ bị ẩn khi in) */}
      <div className="print:hidden p-8 max-w-5xl mx-auto">
        <h1 className="text-3xl font-extrabold text-slate-800 mb-8">Lịch sử giao dịch</h1>
        
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-100">
                <th className="py-4 px-6 font-bold text-sm">Mã GD</th>
                <th className="py-4 px-6 font-bold text-sm">Ngày thanh toán</th>
                <th className="py-4 px-6 font-bold text-sm">Số tiền</th>
                <th className="py-4 px-6 font-bold text-sm">Trạng thái</th>
                <th className="py-4 px-6 font-bold text-sm text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {history.length > 0 ? history.map((item) => (
                <React.Fragment key={item.id}>
                  <tr 
                    onClick={() => toggleRow(item.id)}
                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors cursor-pointer ${expandedRowId === item.id ? 'bg-slate-50/50' : ''}`}
                  >
                    <td className="py-4 px-6 text-sm font-semibold text-slate-700 flex items-center gap-2">
                      {expandedRowId === item.id ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      {item.transaction_id || item.id}
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500">
                      {new Date(item.created_at).toLocaleDateString('vi-VN')} {new Date(item.created_at).toLocaleTimeString('vi-VN')}
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-800">
                      {item.amount.toLocaleString()} VNĐ
                    </td>
                    <td className="py-4 px-6">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                        item.status === 'succeeded' || item.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                        item.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {item.status === 'succeeded' || item.status === 'active' ? <CheckCircle size={14} /> : <Clock size={14} />}
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {(item.status === 'succeeded' || item.status === 'active') && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadInvoice(item);
                          }}
                          disabled={isGenerating}
                          className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-bold text-sm bg-sky-50 hover:bg-sky-100 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Download size={16} />
                          {isGenerating && selectedInvoice?.id === item.id ? 'Đang tạo...' : 'Hóa Đơn'}
                        </button>
                      )}
                    </td>
                  </tr>
                  
                  {/* EXPANDABLE DETAILS ROW */}
                  {expandedRowId === item.id && (
                    <tr className="bg-slate-50/80 border-b border-slate-100">
                      <td colSpan={5} className="py-6 px-10">
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {/* Gói dịch vụ */}
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500 shrink-0 mt-1">
                                <Package size={20} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Gói dịch vụ</p>
                                <p className="text-base font-black text-slate-800">{(typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.planName || 'Gói KanvaPro'}</p>
                                <p className="text-xs text-slate-500 mt-1 font-medium">Truy cập toàn bộ tính năng</p>
                              </div>
                            </div>

                            {/* Chi tiết giá */}
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full bg-sky-50 flex items-center justify-center text-sky-500 shrink-0 mt-1">
                                <CreditCard size={20} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Chi tiết thanh toán</p>
                                <p className="text-sm font-bold text-slate-700">Giá gốc: {((typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.originalAmount || item.amount).toLocaleString()}đ</p>
                                {((typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.deductionValue > 0) && (
                                  <p className="text-xs text-rose-500 font-bold mt-1 bg-rose-50 inline-block px-2 py-0.5 rounded">Cấn trừ: -{((typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.deductionValue).toLocaleString()}đ</p>
                                )}
                              </div>
                            </div>

                            {/* Ngày bắt đầu */}
                            <div className="flex items-start gap-4 border-l border-slate-100 pl-8">
                              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0 mt-1">
                                <CalendarDays size={20} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ngày bắt đầu</p>
                                <p className="text-base font-bold text-slate-700">{new Date(item.created_at).toLocaleDateString('vi-VN')}</p>
                              </div>
                            </div>

                            {/* Ngày kết thúc */}
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0 mt-1">
                                <Clock size={20} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ngày kết thúc</p>
                                <p className="text-base font-bold text-slate-700">{calculateEndDate(item.created_at).toLocaleDateString('vi-VN')}</p>
                                <p className={`text-xs font-bold mt-1 inline-block px-2 py-0.5 rounded ${getRemainingDaysText(item.created_at) === 'Đã hết hạn' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-500'}`}>
                                  {getRemainingDaysText(item.created_at)}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Tính năng của gói */}
                          {(() => {
                            const pName = (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.planName;
                            const features = getPlanFeatures(pName);
                            if (features && features.length > 0) {
                              return (
                                <div className="mt-6 pt-6 border-t border-slate-100">
                                  <p className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                                    <Sparkles size={16} className="text-indigo-500" /> Tính năng gói {pName}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-6">
                                    {features.map((feat, idx) => (
                                      <div key={idx} className="flex items-start gap-2">
                                        <CheckCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                                        <span className="text-sm font-medium text-slate-600 leading-snug">{feat}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          })()}

                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">Chưa có lịch sử giao dịch nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* KHU VỰC HÓA ĐƠN ĐỂ IN PDF (Chỉ hiển thị khi hộp thoại In mở ra) */}
      {selectedInvoice && (
        <div className="hidden print:block absolute top-0 left-0 w-full bg-white text-slate-800 p-12" style={{ fontFamily: 'sans-serif' }}>
          <div className="max-w-[800px] mx-auto">
            <div className="flex justify-between items-start mb-12 border-b-2 border-slate-100 pb-8">
              <div>
                <h1 className="text-4xl font-black text-sky-600 mb-2">KanvaPro</h1>
                <p className="text-sm text-slate-500">Nền tảng thiết kế đồ họa chuyên nghiệp</p>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-slate-300 mb-2">INVOICE</h2>
                <p className="text-sm font-bold text-slate-600">Mã: #{selectedInvoice.transaction_id || selectedInvoice.id.substring(0,8)}</p>
                <p className="text-sm text-slate-500">Ngày: {new Date(selectedInvoice.created_at).toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

              <div className="flex justify-between mb-12">
                <div>
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Thanh toán từ</h3>
                  <p className="font-bold text-slate-800 text-lg">Khách hàng</p>
                  <p className="text-slate-600">{user?.name}</p>
                  <p className="text-slate-600">{user?.email}</p>
                </div>
                <div className="text-right">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Thanh toán cho</h3>
                  <p className="font-bold text-slate-800 text-lg">KanvaPro Inc.</p>
                  <p className="text-slate-600">123 Design Street</p>
                  <p className="text-slate-600">Creative City, VN</p>
                </div>
              </div>

              <table className="w-full text-left mb-12">
                <thead>
                  <tr className="border-b-2 border-slate-800 text-slate-800">
                    <th className="py-3 font-bold">Mô tả</th>
                    <th className="py-3 font-bold text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-200">
                    <td className="py-5">
                      <p className="font-bold text-lg">{selectedInvoice.metadata?.planName || 'Gói KanvaPro'}</p>
                      <p className="text-sm text-slate-500">Kích hoạt tài khoản chuyên nghiệp</p>
                    </td>
                    <td className="py-5 font-bold text-xl text-right">
                      {selectedInvoice.amount.toLocaleString()} VNĐ
                    </td>
                  </tr>
                </tbody>
              </table>

              <div className="flex justify-end mb-16">
                <div className="w-1/2">
                  <div className="flex justify-between py-3 border-b border-slate-200">
                    <span className="font-bold text-slate-600">Tạm tính:</span>
                    <span className="font-bold text-slate-800">{selectedInvoice.amount.toLocaleString()} VNĐ</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-slate-200">
                    <span className="font-bold text-slate-600">Thuế VAT (0%):</span>
                    <span className="font-bold text-slate-800">0 VNĐ</span>
                  </div>
                  <div className="flex justify-between py-4 border-b-2 border-slate-800">
                    <span className="font-black text-xl text-slate-800">TỔNG CỘNG:</span>
                    <span className="font-black text-2xl text-sky-600">{selectedInvoice.amount.toLocaleString()} VNĐ</span>
                  </div>
                </div>
              </div>

            <div className="text-center text-slate-500 text-sm mt-12 pt-8 border-t border-slate-100">
              <p className="font-bold text-slate-600 mb-1">Cảm ơn bạn đã tin tưởng và sử dụng KanvaPro!</p>
              <p>Nếu có thắc mắc, vui lòng liên hệ support@kanvapro.com</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
