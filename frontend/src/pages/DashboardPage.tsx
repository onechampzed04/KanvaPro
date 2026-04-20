import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, LogOut, Layout, Image as ImageIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { fetchDesigns, createDesign } from '../api/api';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [designs, setDesigns] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await fetchDesigns();
        // Backend trả về { designs: [...] } nên phải set là data.designs
        setDesigns(data.designs); 
      } catch (err) {
        console.error("Lỗi khi load trang Dashboard:", err);
      }
    };
    loadData();
  }, []);

   const CreateDesign = async (type: string) => {
    try {
      // Chuẩn bị dữ liệu khớp với Model ở Backend
      const newDesign = {
        title: 'Untitled Design',
        design_type: type, // Đổi từ 'type' thành 'design_type'
        width: type === 'presentation' ? 1920 : 1080,
        height: type === 'presentation' ? 1080 : 1080
      };

      const data = await createDesign(newDesign);
      
      // Chuyển hướng sang trang Editor với ID vừa nhận được
      if (data.id) {
        navigate(`/design/${data.id}`);
      }
    } catch (err) {
      console.error("Lỗi khi tạo thiết kế:", err);
      alert("Không thể tạo thiết kế mới, vui lòng thử lại.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">C</div>
          <h1 className="text-xl font-bold text-gray-800">Kanva Pro</h1>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/pricing" className="px-4 py-2 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-bold rounded-full text-sm hover:shadow-lg transition transform hover:scale-105">
            Try Pro
          </Link>
          <span className="text-gray-600">Welcome, {user?.name}</span>
          <button onClick={logout} className="p-2 hover:bg-gray-100 rounded-full text-gray-600">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        {/* Hero / Create Section */}
        <section className="mb-12 text-center">
          <motion.h2 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-3xl font-bold text-gray-900 mb-8"
          >
            What will you design today?
          </motion.h2>
          
          <div className="flex flex-wrap justify-center gap-4">
            {[
              { type: 'social_media', icon: ImageIcon, label: 'Social Media', color: 'purple' },
              { type: 'presentation', icon: Layout, label: 'Presentation', color: 'orange' },
              { type: 'custom', icon: Plus, label: 'Custom Size', color: 'gray' }
            ].map((item, index) => (
              <motion.button 
                key={item.type}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => CreateDesign(item.type)}
                className="flex flex-col items-center justify-center w-32 h-32 bg-white rounded-xl shadow-sm hover:shadow-md transition border border-gray-100 p-4"
              >
                <div className={`w-12 h-12 bg-${item.color}-100 text-${item.color}-600 rounded-full flex items-center justify-center mb-3`}>
                  <item.icon size={24} />
                </div>
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
              </motion.button>
            ))}
          </div>
        </section>

        {/* Recent Designs */}
        <section>
          <h3 className="text-xl font-semibold text-gray-900 mb-6">Recent Designs</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {designs.map((design, index) => (
              <motion.div
                key={design.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link to={`/design/${design.id}`} className="group block bg-white rounded-lg overflow-hidden shadow-sm hover:shadow-md transition border border-gray-200 h-full">
                  <div className="aspect-[4/3] bg-gray-100 relative flex items-center justify-center overflow-hidden">
                    {design.thumbnail_url ? (
                      <img src={design.thumbnail_url} alt={design.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-gray-300">
                        <Layout size={48} />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition" />
                  </div>
                  <div className="p-4">
                    <h4 className="font-medium text-gray-900 truncate">{design.title}</h4>
                    <p className="text-xs text-gray-500 mt-1">Edited {new Date(design.updated_at).toLocaleDateString()}</p>
                  </div>
                </Link>
              </motion.div>
            ))}
            
            {designs.length === 0 && (
              <div className="col-span-full text-center py-12 text-gray-500">
                No designs yet. Start creating!
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
