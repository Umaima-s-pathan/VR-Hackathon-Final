import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Download, CheckCircle, Clock, AlertCircle, Eye, Cpu, Palette, Zap, Sparkles } from 'lucide-react';

interface ProcessingStage {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
}

const ProcessingPage = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const [stages, setStages] = useState<ProcessingStage[]>([
    {
      id: 'depth',
      name: 'Depth Map Generation',
      description: 'Analyzing video frames with MiDaS AI to create accurate depth maps',
      icon: Eye,
      status: 'processing',
      progress: 0
    },
    {
      id: 'stereo',
      name: 'Stereo Synthesis',
      description: 'Converting to stereoscopic 3D using depth-image-based rendering',
      icon: Cpu,
      status: 'pending',
      progress: 0
    },
    {
      id: 'outpainting',
      name: 'AI Outpainting & Projection',
      description: 'Expanding panorama and applying geometric projection mapping',
      icon: Palette,
      status: 'pending',
      progress: 0
    },
    {
      id: 'blur',
      name: 'Foveated Edge Blur',
      description: 'Applying natural peripheral vision blur for comfort',
      icon: Sparkles,
      status: 'pending',
      progress: 0
    },
    {
      id: 'upscaling',
      name: 'AI Upscaling & Enhancement',
      description: 'Enhancing to 4K+ resolution with Real-ESRGAN',
      icon: Zap,
      status: 'pending',
      progress: 0
    }
  ]);
  
  const [overallProgress, setOverallProgress] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) {
      navigate('/upload');
      return;
    }

    // Real API polling for job status
    const pollJobStatus = async () => {
      try {
        const response = await fetch(`/api/status/${jobId}`);
        if (response.ok) {
          const jobData = await response.json();

          // Update stages based on real backend data
          setStages(prevStages => {
            return prevStages.map(stage => {
              const backendStage = jobData.stages?.find((s: any) => s.name === stage.id);
              if (backendStage) {
                return {
                  ...stage,
                  status: backendStage.status,
                  progress: backendStage.progress || 0
                };
              }
              return stage;
            });
          });

          // Calculate overall progress
          const completedStages = stages.filter(s => s.status === 'completed').length;
          const processingStages = stages.filter(s => s.status === 'processing').length;
          const overall = (completedStages * 100 + processingStages * 50) / stages.length;
          setOverallProgress(Math.min(overall, 100));

          // Check if job is completed
          if (jobData.status === 'completed') {
            setIsCompleted(true);
            setDownloadUrl(`/api/download/${jobId}`);
          } else if (jobData.status === 'error') {
            setError(jobData.error || 'Processing failed');
          }
        } else {
          setError('Failed to fetch job status');
        }
      } catch (error) {
        setError('Failed to connect to processing server');
      }
    };

    // Poll immediately and then every 5 seconds
    pollJobStatus();
    const interval = setInterval(pollJobStatus, 5000);

    return () => clearInterval(interval);
  }, [jobId, navigate]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'processing':
        return <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400"></div>;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-400" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  if (error) {
    return (
      <div className="min-h-screen pt-20 pb-12 flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-8">
            <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white mb-4">Processing Failed</h2>
            <p className="text-red-200 mb-6">{error}</p>
            <Link
              to="/upload"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-8 py-3 rounded-full font-semibold transition-all duration-300"
            >
              Try Again
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <Link 
          to="/"
          className="inline-flex items-center space-x-2 text-purple-400 hover:text-purple-300 mb-8 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to Home</span>
        </Link>

        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            {isCompleted ? 'Conversion Complete!' : 'Processing Your Video'}
          </h1>
          <p className="text-xl text-gray-300">
            {isCompleted 
              ? 'Your VR180 video is ready for download and viewing'
              : 'Our AI pipeline is transforming your 2D video into an immersive VR180 experience'
            }
          </p>
        </div>

        {/* Overall Progress */}
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-8 border border-white/10 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Overall Progress</h3>
            <span className="text-2xl font-bold text-purple-400">{Math.round(overallProgress)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div 
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${overallProgress}%` }}
            ></div>
          </div>
        </div>

        {/* Processing Stages */}
        <div className="space-y-4 mb-8">
          {stages.map((stage, index) => {
            const StageIcon = stage.icon;
            return (
              <div
                key={stage.id}
                className={`bg-white/5 backdrop-blur-lg rounded-xl p-6 border transition-all duration-300 ${
                  stage.status === 'processing' 
                    ? 'border-purple-400/50 bg-purple-400/5' 
                    : stage.status === 'completed'
                    ? 'border-green-400/50 bg-green-400/5'
                    : 'border-white/10'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <div className={`p-3 rounded-lg ${
                    stage.status === 'processing' 
                      ? 'bg-purple-500/20' 
                      : stage.status === 'completed'
                      ? 'bg-green-500/20'
                      : 'bg-gray-500/20'
                  }`}>
                    <StageIcon className={`h-6 w-6 ${
                      stage.status === 'processing' 
                        ? 'text-purple-400' 
                        : stage.status === 'completed'
                        ? 'text-green-400'
                        : 'text-gray-400'
                    }`} />
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-semibold text-white">{stage.name}</h4>
                      {getStatusIcon(stage.status)}
                    </div>
                    <p className="text-gray-300 text-sm mb-2">{stage.description}</p>
                    
                    {stage.status === 'processing' && (
                      <div className="w-full bg-gray-700 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${stage.progress}%` }}
                        ></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Completion Actions */}
        {isCompleted && (
          <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 backdrop-blur-lg rounded-2xl p-8 border border-green-500/20">
            <div className="text-center space-y-6">
              <CheckCircle className="h-16 w-16 text-green-400 mx-auto" />
              <h3 className="text-2xl font-bold text-white">Your VR180 Video is Ready!</h3>
              <p className="text-gray-300">
                Your video has been successfully converted to an immersive VR180 experience with AI-enhanced quality.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {downloadUrl && (
                  <a
                    href={downloadUrl}
                    download={`vr180_converted_${Date.now()}.mp4`}
                    className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 flex items-center justify-center space-x-2"
                  >
                    <Download className="h-5 w-5" />
                    <span>Download VR180 Video</span>
                  </a>
                )}
                
                <Link
                  to={`/experience?video=${encodeURIComponent(downloadUrl || '')}&jobId=${jobId}`}
                  className="border-2 border-white/30 hover:border-white/60 text-white px-8 py-4 rounded-full text-lg font-semibold transition-all duration-300 hover:bg-white/10 flex items-center justify-center space-x-2"
                >
                  <Eye className="h-5 w-5" />
                  <span>Preview in VR</span>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProcessingPage;