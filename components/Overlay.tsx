import React from 'react';
import { Loader2, Pause, Play, Hand, Mic, Activity, Sun, CloudRain, Wind, Volume2, Smile, Move, Gamepad2, ShoppingBag, X, Check, Lock, Star, RotateCcw, Skull } from 'lucide-react';
import { SystemState, AppStatus, Emotion, StoreItem } from '../types';

interface OverlayProps {
  status: AppStatus;
  systemState: SystemState;
  onStart: () => void;
  onTogglePause: () => void;
  error?: string;
  // XP & Shop Props
  xp: number;
  storeItems: StoreItem[];
  isShopOpen: boolean;
  onOpenShop: () => void;
  onCloseShop: () => void;
  onPurchase: (item: StoreItem) => void;
  onEquip: (item: StoreItem) => void;
}

const Overlay: React.FC<OverlayProps> = ({ 
  status, 
  systemState, 
  onStart, 
  onTogglePause, 
  error,
  xp,
  storeItems,
  isShopOpen,
  onOpenShop,
  onCloseShop,
  onPurchase,
  onEquip
}) => {
  const isPaused = status === AppStatus.PAUSED;
  const isRunning = status === AppStatus.RUNNING;

  // --- Intro Screen ---
  if (status === AppStatus.IDLE || status === AppStatus.READY) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-stone-900/90 text-amber-50 font-serif">
        <div className="max-w-lg text-center p-8">
          <h1 className="text-6xl italic font-light tracking-wide mb-6 bg-gradient-to-br from-amber-100 to-amber-600 bg-clip-text text-transparent">
            心灵草甸
          </h1>
          <p className="text-stone-400 text-lg leading-relaxed mb-12 font-light">
            一个由你的存在塑造的数字避难所。<br/>
            <span className="text-amber-200">微笑</span> 唤来阳光，<span className="text-blue-300">皱眉</span> 召集风雨。<br/>
            <span className="text-amber-200">靠近</span> 屏幕前进，<span className="text-red-300">远离</span> 屏幕后退。<br/>
            寻找并收集 <span className="text-cyan-300">发光碎片</span> 以解锁新的形态。
          </p>
          
          <button
            onClick={onStart}
            className="group px-10 py-3 border border-amber-500/30 rounded-full hover:bg-amber-500/10 transition-all duration-500 ease-out backdrop-blur-md"
          >
            <span className="text-sm tracking-[0.2em] uppercase font-sans font-light group-hover:tracking-[0.3em] transition-all text-amber-100">
              进入草甸
            </span>
          </button>
          
          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-stone-500 font-sans tracking-widest uppercase">
            <span className="flex items-center gap-1"><Hand className="w-3 h-3"/> 手势控制距离</span>
            <span className="flex items-center gap-1"><Star className="w-3 h-3"/> 收集积分</span>
          </div>
        </div>
      </div>
    );
  }

  // --- Loading ---
  if (status === AppStatus.LOADING) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-stone-900 text-amber-50 font-serif">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600 mb-4 font-thin" />
        <p className="text-sm tracking-[0.2em] uppercase text-stone-500">正在播种...</p>
      </div>
    );
  }

  // --- Game Over ---
  if (status === AppStatus.GAME_OVER) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 text-red-50 font-serif animate-in fade-in duration-1000">
         <div className="text-center p-8 border border-red-500/20 rounded-2xl bg-red-950/20 backdrop-blur-md">
            <div className="flex justify-center mb-6">
                <Skull className="w-12 h-12 text-red-400/80" />
            </div>
            <h2 className="text-4xl italic mb-4 text-red-200">连接断开</h2>
            <p className="text-stone-400 mb-8 max-w-xs mx-auto">
                你迷失在了草甸之外的虚空中。<br/>
                请保持在光芒照耀的范围内。
            </p>
            <button
                onClick={onStart}
                className="group px-8 py-3 bg-red-900/30 hover:bg-red-800/50 border border-red-500/30 rounded-full transition-all duration-300 flex items-center gap-3 mx-auto"
            >
                <RotateCcw className="w-4 h-4 text-red-300 group-hover:-rotate-180 transition-transform duration-500" />
                <span className="text-sm uppercase tracking-widest text-red-100">重新开始</span>
            </button>
         </div>
      </div>
    );
  }

  // --- Error ---
  if (status === AppStatus.ERROR) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-stone-900 text-white font-serif">
        <div className="text-center">
          <p className="text-red-400 italic mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="border-b border-white/30 text-sm">重新加载</button>
        </div>
      </div>
    );
  }

  // --- Shop Modal ---
  if (isShopOpen) {
    return (
       <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 font-serif">
         <div className="bg-stone-900 border border-amber-500/20 w-full max-w-4xl h-[80vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between bg-stone-900/50">
               <div className="flex items-center gap-3">
                 <ShoppingBag className="w-6 h-6 text-amber-300" />
                 <h2 className="text-2xl italic text-amber-100">灵性商店</h2>
               </div>
               <div className="flex items-center gap-6">
                 <div className="bg-stone-800 px-4 py-1.5 rounded-full border border-amber-500/30 flex items-center gap-2">
                    <span className="text-cyan-300 font-mono text-sm">{xp}</span>
                    <span className="text-[10px] uppercase tracking-widest text-stone-400">积分</span>
                 </div>
                 <button onClick={onCloseShop} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                    <X className="w-6 h-6 text-stone-400" />
                 </button>
               </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* Skins Section */}
               <div>
                  <h3 className="text-sm uppercase tracking-[0.2em] text-stone-500 mb-4">形态 (Skins)</h3>
                  <div className="space-y-3">
                    {storeItems.filter(i => i.type === 'skin').map(item => (
                       <ShopItemCard 
                         key={item.id} 
                         item={item} 
                         currentXp={xp} 
                         onPurchase={() => onPurchase(item)}
                         onEquip={() => onEquip(item)}
                       />
                    ))}
                  </div>
               </div>
               
               {/* Companions Section */}
               <div>
                  <h3 className="text-sm uppercase tracking-[0.2em] text-stone-500 mb-4">伙伴 (Companions)</h3>
                  <div className="space-y-3">
                    {storeItems.filter(i => i.type === 'companion').map(item => (
                       <ShopItemCard 
                         key={item.id} 
                         item={item} 
                         currentXp={xp} 
                         onPurchase={() => onPurchase(item)}
                         onEquip={() => onEquip(item)}
                       />
                    ))}
                  </div>
               </div>
            </div>
         </div>
       </div>
    );
  }

  // --- Paused ---
  if (isPaused) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm text-white">
        <button 
          onClick={onTogglePause}
          className="p-8 rounded-full border border-white/10 hover:border-white/40 transition-all duration-500 group mb-8"
        >
          <Play className="w-8 h-8 fill-white/80 text-transparent group-hover:scale-110 transition-transform" />
        </button>
        <button 
           onClick={onOpenShop}
           className="px-6 py-2 bg-stone-800/80 border border-amber-500/30 rounded-full hover:bg-stone-700 transition-colors flex items-center gap-2"
        >
           <ShoppingBag className="w-4 h-4 text-amber-200" />
           <span className="text-sm text-amber-100">打开商店</span>
        </button>
      </div>
    );
  }

  // --- Active Art Status Helper ---
  const getEmotionText = () => {
    switch(systemState.emotion) {
      case Emotion.HAPPY: return "生长 (夏)";
      case Emotion.SAD: return "风暴 (冬)";
      case Emotion.CALM: default: return "宁静 (秋)";
    }
  };

  const renderEmotionIcon = () => {
    switch(systemState.emotion) {
      case Emotion.HAPPY:
        return (
           <div className="text-lg font-serif italic flex items-center gap-2 text-green-300 drop-shadow-[0_0_10px_rgba(74,222,128,0.5)]">
             <Sun className="w-5 h-5" />
             <span>生机勃勃</span>
           </div>
        );
      case Emotion.SAD:
        return (
           <div className="text-lg font-serif italic flex items-center gap-2 text-blue-300 drop-shadow-[0_0_10px_rgba(147,197,253,0.5)]">
             <CloudRain className="w-5 h-5" />
             <span>风雨交加</span>
           </div>
        );
      case Emotion.CALM:
      default:
        return (
           <div className="text-lg font-serif italic flex items-center gap-2 text-amber-300 drop-shadow-[0_0_10px_rgba(252,211,77,0.5)]">
             <Wind className="w-5 h-5" />
             <span>平静祥和</span>
           </div>
        );
    }
  };

  return (
    <div className="absolute inset-0 pointer-events-none z-40 font-serif">
      {/* HUD: Score (Top Center) */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto">
         <div 
           className="bg-black/30 backdrop-blur-md border border-white/10 rounded-full px-5 py-2 flex items-center gap-3 cursor-pointer hover:bg-black/50 transition-colors"
           onClick={onOpenShop}
         >
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]" />
            <span className="text-cyan-100 font-mono text-lg">{xp}</span>
            <ShoppingBag className="w-4 h-4 text-white/50" />
         </div>
      </div>

      {/* Top Left: Stats Panel */}
      {isRunning && (
        <div className="absolute top-6 left-6 pointer-events-auto">
          <div className="bg-stone-900/30 backdrop-blur-md p-5 rounded-lg border border-amber-500/10 space-y-4 w-60 shadow-2xl transition-all hover:bg-stone-900/50">
            <div className="flex items-center justify-between border-b border-amber-500/10 pb-2">
              <span className="text-[10px] font-sans font-bold uppercase tracking-[0.2em] text-stone-400">环境参数</span>
              <Activity className="w-3 h-3 text-amber-500/50 animate-pulse" />
            </div>

            <div className="space-y-4">
              {/* Emotion / Weather */}
              <div>
                <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                  <span>季节 (面部)</span>
                </div>
                {renderEmotionIcon()}
                <div className="text-[9px] text-stone-600 mt-1 font-mono">
                  曲率: {systemState.mouthCurvature.toFixed(3)}
                </div>
              </div>
              
              {/* Hand State */}
              <div>
                 <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                  <span>物理 (手势)</span>
                </div>
                <div className="text-amber-100 text-sm flex items-center gap-2">
                    <Hand className="w-4 h-4 text-amber-500" />
                    <span>{systemState.handSize > 0.13 ? "靠近 (前进)" : systemState.handSize < 0.10 ? "远离 (后退)" : "静止"}</span>
                </div>
                <div className="text-[9px] text-stone-500 mt-1 font-sans">
                   偏移: X:{systemState.handPosition.x.toFixed(2)} 大小:{systemState.handSize.toFixed(3)}
                </div>
              </div>

              {/* Wind Strength */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2 text-[10px] uppercase tracking-wider text-stone-500 font-sans">
                  <span>音频强度</span>
                  <span className="font-mono text-amber-100/70">{systemState.soundAmplitude.toFixed(2)}</span>
                </div>
                <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-200/80 transition-all duration-100 shadow-[0_0_10px_rgba(255,255,255,0.3)]" 
                    style={{ width: `${Math.min(systemState.soundAmplitude * 200, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Center Title/Status */}
      <div className="absolute bottom-10 left-0 w-full text-center">
        <div className="inline-block px-6 py-2">
          <span className="block text-2xl italic font-light text-amber-50/80 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] transition-all duration-1000">
            {getEmotionText()}
          </span>
        </div>
      </div>

      {/* Top Right Pause */}
      <div className="absolute top-6 right-6 pointer-events-auto">
        <button 
          onClick={onTogglePause}
          className="p-3 text-amber-100/30 hover:text-amber-100 transition-colors"
        >
          <Pause className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// --- Subcomponent: Shop Item Card ---
const ShopItemCard: React.FC<{
    item: StoreItem; 
    currentXp: number;
    onPurchase: () => void;
    onEquip: () => void;
}> = ({ item, currentXp, onPurchase, onEquip }) => {
    const canAfford = currentXp >= item.cost;

    return (
        <div className={`p-4 rounded-xl border transition-all duration-300 ${item.active ? 'bg-amber-500/10 border-amber-500/50' : 'bg-stone-800/50 border-white/5 hover:bg-stone-800'}`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h4 className={`text-lg italic ${item.active ? 'text-amber-200' : 'text-stone-200'}`}>{item.name}</h4>
                    <p className="text-xs text-stone-500 font-light mt-1">{item.description}</p>
                </div>
                {item.unlocked ? (
                    item.active ? (
                        <div className="bg-amber-500/20 p-1.5 rounded-full">
                            <Check className="w-4 h-4 text-amber-400" />
                        </div>
                    ) : (
                        <button 
                            onClick={onEquip}
                            className="px-3 py-1 bg-stone-700 hover:bg-stone-600 text-xs text-stone-300 rounded-md transition-colors"
                        >
                            装备
                        </button>
                    )
                ) : (
                    <div className="flex items-center gap-1 text-stone-500 bg-black/20 px-2 py-1 rounded">
                        <Lock className="w-3 h-3" />
                        <span className="text-xs">未解锁</span>
                    </div>
                )}
            </div>
            
            {!item.unlocked && (
                <div className="mt-3 flex items-center justify-between">
                    <span className={`text-sm font-mono ${canAfford ? 'text-cyan-300' : 'text-red-400'}`}>
                        {item.cost} XP
                    </span>
                    <button 
                        onClick={onPurchase}
                        disabled={!canAfford}
                        className={`px-4 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors ${
                            canAfford 
                            ? 'bg-amber-600 hover:bg-amber-500 text-white' 
                            : 'bg-stone-700 text-stone-500 cursor-not-allowed'
                        }`}
                    >
                        购买
                    </button>
                </div>
            )}
        </div>
    );
}

export default Overlay;