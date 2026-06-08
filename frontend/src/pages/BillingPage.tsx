import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Download, CheckCircle, Clock, ChevronDown, ChevronUp, CalendarDays, Package, CreditCard, Sparkles, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { fetchActiveSubscriptions, verifyOrderByCode } from '../api/api';
import Swal from 'sweetalert2';

function formatVND(amount: number) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export default function BillingPage() {
  const { user, refreshUser } = useAuth() as any;
  const [history, setHistory] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Lấy thông tin subscription hiện tại của user
  const activeSub = user?.subscription;
  const isSubActive = activeSub?.status === 'active' && activeSub?.current_period_end && new Date(activeSub.current_period_end) > new Date();

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/payments/history', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        // Hiển thị tất cả kể cả Pending để user thấy và tự kiểm tra
        setHistory(data.history || []);
      } catch (err) {
        console.error('Lỗi lấy lịch sử thanh toán', err);
      }
    };

    const loadPlans = async () => {
      try {
        const data = await fetchActiveSubscriptions();
        setPlans(data.subscriptions || data.plans || data || []);
      } catch (error) {
        console.error('Lỗi tải thông tin gói cước:', error);
      }
    };

    fetchHistory();
    loadPlans();
  }, []);

  const handleDownloadInvoice = async (invoice: any) => {
    setSelectedInvoice(invoice);
    setIsGenerating(true);
    setTimeout(() => {
      window.print();
      setIsGenerating(false);
    }, 500);
  };

  // [MỚI] Nút "Tôi đã chuyển khoản - Kiểm tra lại"
  const handleVerifyOrder = async (item: any) => {
    const orderCode = item.transaction_id;
    if (!orderCode) {
      Swal.fire('Lỗi', 'Không tìm thấy mã đơn hàng để kiểm tra.', 'error');
      return;
    }
    setVerifyingId(item.id);
    try {
      const result = await verifyOrderByCode(orderCode);
      if (result.success) {
        await Swal.fire('Thành công! 🎉', result.message, 'success');
        // Reload lại lịch sử và thông tin user
        window.location.reload();
      } else {
        Swal.fire(
          'Chưa xác nhận',
          `${result.message}\n\nNếu bạn chắc chắn đã thanh toán, vui lòng liên hệ hỗ trợ qua support@kanvapro.com kèm ảnh chụp màn hình giao dịch.`,
          'warning'
        );
      }
    } catch (err: any) {
      Swal.fire('Lỗi', err.message || 'Không thể kiểm tra giao dịch lúc này.', 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const toggleRow = (id: string) => {
    setExpandedRowId(expandedRowId === id ? null : id);
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

  const getStatusBadge = (status: string) => {
    if (status === 'succeeded' || status === 'active') {
      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700"><CheckCircle size={14} />THÀNH CÔNG</span>;
    }
    if (status === 'pending') {
      return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700"><Clock size={14} />CHỜ XỬ LÝ</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700"><XCircle size={14} />{status?.toUpperCase()}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans relative">
      {/* KHU VỰC HIỂN THỊ CHÍNH */}
      <div className="print:hidden p-8 max-w-5xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <h1 className="text-3xl font-extrabold text-slate-800">Lịch sử giao dịch</h1>
        </div>

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
                      {(item.transaction_id || item.id)?.toString().substring(0, 12)}...
                    </td>
                    <td className="py-4 px-6 text-sm text-slate-500">
                      {new Date(item.created_at).toLocaleDateString('vi-VN')} {new Date(item.created_at).toLocaleTimeString('vi-VN')}
                    </td>
                    <td className="py-4 px-6 text-sm font-bold text-slate-800">
                      {formatVND(item.amount)}
                    </td>
                    <td className="py-4 px-6">
                      {getStatusBadge(item.status)}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* [MỚI] Nút tự kiểm tra cho giao dịch Pending */}
                        {item.status === 'pending' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleVerifyOrder(item); }}
                            disabled={verifyingId === item.id}
                            className="inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 hover:bg-amber-100 font-semibold text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                          >
                            <RefreshCw size={13} className={verifyingId === item.id ? 'animate-spin' : ''} />
                            {verifyingId === item.id ? 'Đang kiểm tra...' : 'Tôi đã chuyển khoản'}
                          </button>
                        )}
                        {/* Nút tải hóa đơn cho giao dịch thành công */}
                        {(item.status === 'succeeded' || item.status === 'active') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDownloadInvoice(item); }}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-2 text-sky-600 hover:text-sky-700 font-bold text-sm bg-sky-50 hover:bg-sky-100 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                          >
                            <Download size={16} />
                            {isGenerating && selectedInvoice?.id === item.id ? 'Đang tạo...' : 'Hóa Đơn'}
                          </button>
                        )}
                      </div>
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
                                <p className="text-sm font-bold text-slate-700">Giá gốc: {formatVND((typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.originalAmount || item.amount)}</p>
                                {((typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.deductionValue > 0) && (
                                  <p className="text-xs text-rose-500 font-bold mt-1 bg-rose-50 inline-block px-2 py-0.5 rounded">Cấn trừ: -{formatVND((typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata)?.deductionValue)}</p>
                                )}
                              </div>
                            </div>

                            {/* Ngày bắt đầu — [ĐÃ SỬA] Lấy từ DB thay vì hardcode */}
                            <div className="flex items-start gap-4 border-l border-slate-100 pl-8">
                              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0 mt-1">
                                <CalendarDays size={20} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ngày bắt đầu</p>
                                <p className="text-base font-bold text-slate-700">
                                  {item.current_period_start
                                    ? new Date(item.current_period_start).toLocaleDateString('vi-VN')
                                    : new Date(item.created_at).toLocaleDateString('vi-VN')
                                  }
                                </p>
                              </div>
                            </div>

                            {/* Ngày kết thúc — [ĐÃ SỬA] Lấy từ DB, không cộng cứng 30 ngày */}
                            <div className="flex items-start gap-4">
                              <div className="w-10 h-10 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 shrink-0 mt-1">
                                <Clock size={20} />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Ngày kết thúc</p>
                                {item.current_period_end ? (
                                  <>
                                    <p className="text-base font-bold text-slate-700">{new Date(item.current_period_end).toLocaleDateString('vi-VN')}</p>
                                    {(() => {
                                      const now = new Date();
                                      const end = new Date(item.current_period_end);
                                      const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                      if (diff < 0) return <p className="text-xs font-bold mt-1 bg-slate-100 text-slate-500 inline-block px-2 py-0.5 rounded">Đã hết hạn</p>;
                                      if (diff <= 7) return <p className="text-xs font-bold mt-1 bg-amber-50 text-amber-500 inline-block px-2 py-0.5 rounded">Còn {diff} ngày ⚠️</p>;
                                      return <p className="text-xs font-bold mt-1 bg-emerald-50 text-emerald-600 inline-block px-2 py-0.5 rounded">Còn {diff} ngày</p>;
                                    })()}
                                  </>
                                ) : (
                                  <p className="text-sm text-slate-400">—</p>
                                )}
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

      {/* KHU VỰC HÓA ĐƠN ĐỂ IN PDF — [ĐÃ SỬA] Thêm dấu PAID + tách dòng thuế rõ ràng */}
      {selectedInvoice && (
        <div className="hidden print:block absolute top-0 left-0 w-full bg-white text-slate-800 p-12" style={{ fontFamily: 'sans-serif' }}>
          <div className="max-w-[800px] mx-auto">
            <div className="flex justify-between items-start mb-12 border-b-2 border-slate-100 pb-8">
              <div>
                <h1 className="text-4xl font-black text-sky-600 mb-2">KanvaPro</h1>
                <p className="text-sm text-slate-500">Nền tảng thiết kế đồ họa chuyên nghiệp</p>
              </div>
              <div className="text-right">
                {/* [MỚI] Watermark ĐÃ THANH TOÁN */}
                <div className="inline-block border-4 border-emerald-500 text-emerald-600 font-black text-xl px-4 py-1 rounded rotate-[-5deg] mb-3 opacity-80">
                  ĐÃ THANH TOÁN
                </div>
                <h2 className="text-2xl font-bold text-slate-300 mb-2">INVOICE</h2>
                <p className="text-sm font-bold text-slate-600">Mã: #{selectedInvoice.transaction_id || selectedInvoice.id.substring(0, 8)}</p>
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
                    {/* Hiển thị thời hạn sử dụng từ DB */}
                    {selectedInvoice.current_period_start && selectedInvoice.current_period_end && (
                      <p className="text-xs text-slate-400 mt-1">
                        Hiệu lực: {new Date(selectedInvoice.current_period_start).toLocaleDateString('vi-VN')} — {new Date(selectedInvoice.current_period_end).toLocaleDateString('vi-VN')}
                      </p>
                    )}
                  </td>
                  <td className="py-5 font-bold text-xl text-right">
                    {formatVND(selectedInvoice.amount)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* [ĐÃ SỬA] Tách 3 dòng: Tạm tính | VAT | Tổng cộng (Tính ngược VAT 10% từ tổng tiền) */}
            <div className="flex justify-end mb-16">
              <div className="w-1/2">
                <div className="flex justify-between py-3 border-b border-slate-200">
                  <span className="font-bold text-slate-600">Tạm tính (Sub-total):</span>
                  <span className="font-bold text-slate-800">{formatVND(Math.round(selectedInvoice.amount / 1.1))}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-slate-200">
                  <span className="font-bold text-slate-600">Thuế VAT (10%):</span>
                  <span className="font-bold text-slate-800">{formatVND(selectedInvoice.amount - Math.round(selectedInvoice.amount / 1.1))}</span>
                </div>
                <div className="flex justify-between py-4 border-b-2 border-slate-800">
                  <span className="font-black text-xl text-slate-800">TỔNG CỘNG:</span>
                  <span className="font-black text-2xl text-sky-600">{formatVND(selectedInvoice.amount)}</span>
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
