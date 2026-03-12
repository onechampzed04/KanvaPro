import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer } from 'react-konva';
import useImage from 'use-image';
import { 
  ChevronLeft, Type, Image as ImageIcon, Square, Download, 
  Settings, Layers, MousePointer2, Save, Search
} from 'lucide-react';
import { updateDesignFull } from '../api/api';

const URLImage = ({ image, isSelected, onSelect, onChange }: any) => {
  const [img] = useImage(image.src);
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KonvaImage
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        image={img}
        x={image.x}
        y={image.y}
        width={image.width}
        height={image.height}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...image,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...image,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

const RectangleShape = ({ shape, isSelected, onSelect, onChange }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Rect
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...shape}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...shape,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...shape,
            x: node.x(),
            y: node.y(),
            width: Math.max(5, node.width() * scaleX),
            height: Math.max(5, node.height() * scaleY),
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

const EditableText = ({ text, isSelected, onSelect, onChange }: any) => {
  const shapeRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  useEffect(() => {
    if (isSelected) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <Text
        onClick={onSelect}
        onTap={onSelect}
        ref={shapeRef}
        {...text}
        draggable
        onDragEnd={(e) => {
          onChange({
            ...text,
            x: e.target.x(),
            y: e.target.y(),
          });
        }}
        onTransformEnd={(e) => {
          const node = shapeRef.current;
          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            ...text,
            x: node.x(),
            y: node.y(),
            fontSize: text.fontSize * scaleX, // Simple scaling for text
          });
        }}
      />
      {isSelected && (
        <Transformer
          ref={trRef}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
};

export default function EditorPage() {
  const { id } = useParams();
  const [design, setDesign] = useState<any>(null);
  const [elements, setElements] = useState<any[]>([]);
  const [selectedId, selectShape] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('elements'); // elements, uploads, text, search_results
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Canvas dimensions (would come from design)
  const stageWidth = 800;
  const stageHeight = 600;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Nếu nhấn phím Delete hoặc Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Kiểm tra xem người dùng có đang gõ chữ vào ô Input nào không (để tránh xóa nhầm)
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

        deleteSelectedElement();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup để tránh bị lặp sự kiện khi chuyển trang
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, elements]); // Quan trọng: phải đưa sele

  useEffect(() => {
    fetch(`/api/designs/${id}`, {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
    })
    .then(res => res.json())
    .then(data => {
        console.log("Dữ liệu thiết kế nhận về:", data); // <-- THÊM DÒNG NÀY ĐỂ KIỂM TRA
        setDesign(data);
        
        if (data.pages && data.pages.length > 0 && data.pages[0].elements) {
            setElements(data.pages[0].elements);
        }
    })
    .catch(err => console.error("Lỗi khi load design:", err));
}, [id]);

  const handleSave = async () => {
    if (!id) return;
    setIsSaving(true);
    try {
      const data = {
        title: design?.title || 'Untitled Design',
        elements: elements // Đây là mảng elements bạn đang quản lý bằng useState
      };
      
      await updateDesignFull(id, data);
      alert("Thiết kế đã được lưu thành công!");
    } catch (error) {
      console.error(error);
      alert("Lỗi khi lưu thiết kế");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!searchQuery.trim()) return;

      try {
        const res = await fetch(`/api/assets?query=${encodeURIComponent(searchQuery)}&type=image`);
        const data = await res.json();
        
        // Update the "elements" tab content or switch to a search results view
        // For this clone, we'll just add the first few results to the canvas to demonstrate
        // In a real app, we'd update the sidebar list.
        
        // Let's hack the sidebar to show these results for now
        // We need a state for "searchResults"
        setSearchResults(data);
        setActiveTab('search_results');
      } catch (error) {
        console.error('Search failed:', error);
      }
      
  };

  const addRectangle = () => {
    const newRect = {
      id: crypto.randomUUID(),
      type: 'rect',
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      fill: '#6366f1',
    };
    setElements([...elements, newRect]);
  };

  const addText = () => {
    const newText = {
      id: crypto.randomUUID(),
      type: 'text',
      x: 150,
      y: 150,
      text: 'Double click to edit',
      fontSize: 24,
      fill: '#000000',
    };
    setElements([...elements, newText]);
  };

  const addImage = (src: string) => {
      const newImage = {
          id: crypto.randomUUID(),
          type: 'image',
          x: 200,
          y: 200,
          width: 200,
          height: 200,
          src: src
      };
      setElements([...elements, newImage]);
  }

  const checkDeselect = (e: any) => {
    const clickedOnEmpty = e.target === e.target.getStage();
    if (clickedOnEmpty) {
      selectShape(null);
    }
  };

  const updateElement = (newAttrs: any) => {
      const idx = elements.findIndex(el => el.id === newAttrs.id);
      const newElements = [...elements];
      newElements[idx] = newAttrs;
      setElements(newElements);
  }
  const deleteSelectedElement = () => {
    if (!selectedId) return; // Nếu không có cái nào được chọn thì thôi

    // Lọc bỏ element có ID trùng với selectedId
    const newElements = elements.filter((el) => el.id !== selectedId);
    setElements(newElements);
    
    // Sau khi xóa thì bỏ chọn luôn
    selectShape(null);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Top Bar */}
      <div className="h-14 bg-gradient-to-r from-indigo-900 to-blue-900 text-white flex items-center justify-between px-4 shadow-md z-20">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 hover:bg-white/10 rounded-full transition">
            <ChevronLeft size={20} />
          </Link>
          <div className="flex flex-col">
            <span className="font-semibold text-sm">{design?.title || 'Untitled Design'}</span>
            <span className="text-xs text-white/70">File • Autosaved</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 bg-white/10 hover:bg-white/20 rounded text-sm font-medium transition flex items-center gap-2"
            >
              <Save size={16} /> {isSaving ? 'Saving...' : 'Save'}
            </button>
            <button className="px-4 py-1.5 bg-white text-indigo-900 hover:bg-gray-100 rounded text-sm font-medium transition flex items-center gap-2">
                <Download size={16} /> Export
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-20 bg-gray-900 text-gray-400 flex flex-col items-center py-4 gap-6 z-10 shadow-xl">
          <button 
            onClick={() => setActiveTab('elements')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${activeTab === 'elements' ? 'bg-gray-800 text-white' : 'hover:text-white'}`}
          >
            <Square size={24} />
            <span className="text-[10px]">Elements</span>
          </button>
          <button 
            onClick={() => setActiveTab('uploads')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${activeTab === 'uploads' ? 'bg-gray-800 text-white' : 'hover:text-white'}`}
          >
            <ImageIcon size={24} />
            <span className="text-[10px]">Uploads</span>
          </button>
          <button 
            onClick={() => setActiveTab('text')}
            className={`flex flex-col items-center gap-1 p-2 rounded-lg transition ${activeTab === 'text' ? 'bg-gray-800 text-white' : 'hover:text-white'}`}
          >
            <Type size={24} />
            <span className="text-[10px]">Text</span>
          </button>
        </div>

        {/* Object Panel (Drawer) */}
        <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg z-0">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-800 capitalize">{activeTab}</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {activeTab === 'elements' && (
              <div className="space-y-6">
                 {/* Search Bar */}
                 <form onSubmit={handleSearch} className="relative">
                    <input 
                        type="text" 
                        placeholder="Search icons, shapes..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                    <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                 </form>

                <div>
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3">Featured Icons</h4>
                    <div className="grid grid-cols-3 gap-3">
                        {/* Mock Icons */}
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <button key={i} onClick={() => addImage(`https://picsum.photos/seed/icon${i}/100/100`)} className="aspect-square bg-gray-50 rounded-lg p-2 hover:bg-gray-100 transition">
                                <img src={`https://picsum.photos/seed/icon${i}/100/100`} className="w-full h-full object-contain mix-blend-multiply" />
                            </button>
                        ))}
                    </div>
                </div>
              </div>
            )}

            {activeTab === 'text' && (
              <div className="space-y-4">
                <button onClick={addText} className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-left transition">
                  <h1 className="text-2xl font-bold text-gray-800">Add a heading</h1>
                </button>
                <button onClick={addText} className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-left transition">
                  <h2 className="text-lg font-semibold text-gray-700">Add a subheading</h2>
                </button>
                <button onClick={addText} className="w-full p-4 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 text-left transition">
                  <p className="text-sm text-gray-600">Add a little bit of body text</p>
                </button>
              </div>
            )}

            {activeTab === 'search_results' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="font-semibold text-gray-700">Results for "{searchQuery}"</h3>
                        <button onClick={() => setActiveTab('elements')} className="text-xs text-indigo-600 hover:underline">Back</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {searchResults.map((asset: any) => (
                            <button 
                                key={asset.id} 
                                onClick={() => addImage(asset.url)} 
                                className="aspect-square rounded overflow-hidden hover:opacity-80 transition bg-gray-50"
                            >
                                <img src={asset.thumbnail_url || asset.url} alt={asset.name} className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                    {searchResults.length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">No results found.</p>
                    )}
                </div>
            )}

            {activeTab === 'uploads' && (
                <div className="space-y-4">
                    <button className="w-full py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition">
                        Upload Media
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => addImage('https://picsum.photos/seed/nature/200/200')} className="aspect-square rounded overflow-hidden hover:opacity-80 transition">
                            <img src="https://picsum.photos/seed/nature/200/200" className="w-full h-full object-cover" />
                        </button>
                        <button onClick={() => addImage('https://picsum.photos/seed/tech/200/200')} className="aspect-square rounded overflow-hidden hover:opacity-80 transition">
                            <img src="https://picsum.photos/seed/tech/200/200" className="w-full h-full object-cover" />
                        </button>
                    </div>
                </div>
            )}
          </div>
        </div>

        {/* Canvas Area */}
        <div className="flex-1 bg-gray-200 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-auto flex items-center justify-center p-8 relative">
                <div className="bg-white shadow-2xl" style={{ width: stageWidth, height: stageHeight }}>
                    <Stage
                    width={stageWidth}
                    height={stageHeight}
                    onMouseDown={checkDeselect}
                    onTouchStart={checkDeselect}
                    >
                    <Layer>
                        {/* Background (optional) */}
                        <Rect width={stageWidth} height={stageHeight} fill="#ffffff" />
                        
                        {elements.map((el, i) => {
                        if (el.type === 'rect') {
                            return (
                            <RectangleShape
                                key={el.id}
                                shape={el}
                                isSelected={el.id === selectedId}
                                onSelect={() => selectShape(el.id)}
                                onChange={updateElement}
                            />
                            );
                        }
                        if (el.type === 'text') {
                            return (
                            <EditableText
                                key={el.id}
                                text={el}
                                isSelected={el.id === selectedId}
                                onSelect={() => selectShape(el.id)}
                                onChange={updateElement}
                            />
                            );
                        }
                        if (el.type === 'image') {
                            return (
                                <URLImage
                                    key={el.id}
                                    image={el}
                                    isSelected={el.id === selectedId}
                                    onSelect={() => selectShape(el.id)}
                                    onChange={updateElement}
                                />
                            )
                        }
                        return null;
                        })}
                    </Layer>
                    </Stage>
                </div>
            </div>

            {/* Timeline (Placeholder) */}
            <div className="h-32 bg-white border-t border-gray-200 p-4 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-500 uppercase">Timeline (Video Mode)</span>
                    <div className="flex gap-2">
                        <button className="p-1 hover:bg-gray-100 rounded"><Settings size={14} /></button>
                    </div>
                </div>
                <div className="flex-1 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400 text-sm border border-dashed border-gray-300">
                    Drag and drop clips here to create a video
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
