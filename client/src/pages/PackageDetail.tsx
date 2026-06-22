import { useEffect, useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Trash2,
  Lock,
  Archive,
  Database,
  Download,
  Calendar,
  FileText,
  Loader2,
  AlertTriangle,
  GitCompareArrows,
  X,
  ChevronDown,
  ChevronRight,
  FilePlus,
  FileMinus,
  FileEdit,
  File,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  FileCode,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api';
import type { PackageInfo, RegistryType, CompareResult, MetadataDiffValue, FileDiffEntry, FileContentDiff, DiffLine } from '../types';
import { formatSize, formatDate, formatRelativeTime } from '../utils';

export default function PackageDetail() {
  const params = useParams<{ registry: RegistryType; name: string }>();
  const navigate = useNavigate();
  const [pkg, setPkg] = useState<PackageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersionA, setCompareVersionA] = useState<string>('');
  const [compareVersionB, setCompareVersionB] = useState<string>('');
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [showFileDiff, setShowFileDiff] = useState(false);

  const loadPkg = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPackage(params.registry!, decodeURIComponent(params.name!));
      setPkg(data);
      if (data && data.versions.length >= 2) {
        setCompareVersionA(data.versions[data.versions.length - 1].version);
        setCompareVersionB(data.versions[0].version);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPkg();
  }, [params.registry, params.name]);

  const handleDeleteVersion = async (version: string) => {
    if (!confirm(`确认删除版本 ${pkg?.name}@${version}？`)) return;
    await api.deleteVersion(params.registry!, decodeURIComponent(params.name!), version);
    loadPkg();
  };

  const handleDeleteAll = async () => {
    if (!confirm(`确认删除包 ${pkg?.name}（包含所有 ${pkg?.versions.length} 个版本）？此操作不可恢复！`)) return;
    await api.deletePackage(params.registry!, decodeURIComponent(params.name!));
    navigate('/packages');
  };

  const handleCleanupOld = async () => {
    if (!confirm('仅保留最新 3 个版本，删除其余旧版本？')) return;
    await api.cleanupUnused(params.registry!, decodeURIComponent(params.name!), 3);
    loadPkg();
  };

  const handleCompare = async () => {
    if (!compareVersionA || !compareVersionB || !pkg) return;
    if (compareVersionA === compareVersionB) {
      setCompareError('请选择两个不同的版本进行对比');
      return;
    }
    setCompareLoading(true);
    setCompareError(null);
    setCompareResult(null);
    try {
      const result = await api.compareVersions(
        params.registry!,
        decodeURIComponent(params.name!),
        compareVersionA,
        compareVersionB
      );
      setCompareResult(result);
    } catch (e: any) {
      setCompareError(e.message || '对比失败');
    } finally {
      setCompareLoading(false);
    }
  };

  const closeCompare = () => {
    setCompareMode(false);
    setCompareResult(null);
    setCompareError(null);
  };

  const canCompare = pkg && pkg.versions.length >= 2;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="animate-spin text-indigo-600" size={32} />
      </div>
    );
  }

  if (error || !pkg) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <Link to="/packages" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-6">
          <ArrowLeft size={14} /> 返回包列表
        </Link>
        <div className="card p-12 text-center">
          <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
          <h2 className="text-xl font-semibold text-slate-800 mb-2">包不存在</h2>
          <p className="text-slate-500">{error || '未能找到该包的信息'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <Link to="/packages" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft size={14} /> 返回包列表
      </Link>

      <div className="card p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div
              className={`w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl ${
                pkg.registry === 'npm'
                  ? 'bg-gradient-to-br from-orange-500 to-red-500'
                  : 'bg-gradient-to-br from-sky-500 to-blue-600'
              }`}
            >
              {pkg.registry === 'npm' ? <Archive size={28} /> : <Database size={28} />}
            </div>
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-slate-800">{pkg.name}</h1>
                <span
                  className={`badge ${
                    pkg.registry === 'npm' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                  }`}
                >
                  {pkg.registry.toUpperCase()}
                </span>
                {pkg.source === 'private' ? (
                  <span className="badge bg-rose-100 text-rose-700">
                    <Lock size={10} className="mr-1" /> 私有包
                  </span>
                ) : (
                  <span className="badge bg-emerald-100 text-emerald-700">💾 代理缓存</span>
                )}
              </div>
              {pkg.scope && (
                <p className="text-sm text-slate-500 mt-1">
                  Scope: <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{pkg.scope}</span>
                </p>
              )}
              {pkg.description && (
                <p className="text-slate-600 mt-2 max-w-2xl">{pkg.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {canCompare && (
              <button
                className="btn btn-secondary"
                onClick={() => setCompareMode(true)}
              >
                <GitCompareArrows size={16} /> 版本对比
              </button>
            )}
            {pkg.versions.length > 3 && (
              <button className="btn btn-secondary" onClick={handleCleanupOld}>
                清理旧版本
              </button>
            )}
            <button className="btn btn-danger" onClick={handleDeleteAll}>
              <Trash2 size={16} /> 删除包
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8 pt-6 border-t border-slate-100">
          <InfoCard icon={Archive} label="最新版本" value={pkg.latestVersion || '-'} />
          <InfoCard icon={FileText} label="版本数量" value={`${pkg.versions.length}`} />
          <InfoCard icon={Database} label="总占用" value={formatSize(pkg.totalSize)} />
          <InfoCard icon={Download} label="下载次数" value={`${pkg.downloadCount}`} />
          <InfoCard icon={Calendar} label="最后更新" value={formatRelativeTime(pkg.updatedAt)} />
        </div>

        {(pkg.author || pkg.license) && (
          <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
            {pkg.author && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">作者</span>
                <p className="text-slate-700 mt-1">{pkg.author}</p>
              </div>
            )}
            {pkg.license && (
              <div>
                <span className="text-xs text-slate-400 uppercase tracking-wide">许可证</span>
                <p className="text-slate-700 mt-1">{pkg.license}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">版本列表</h2>
          <span className="text-sm text-slate-500">{pkg.versions.length} 个版本</span>
        </div>

        <div className="space-y-2">
          {pkg.versions.map((ver) => (
            <div
              key={ver.version}
              className="flex items-center justify-between p-4 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-mono font-bold text-sm">
                  v{ver.version.split('.')[0]}
                </div>
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-semibold text-slate-800">{ver.version}</span>
                    {ver.version === pkg.latestVersion && (
                      <span className="badge bg-emerald-100 text-emerald-700">最新</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar size={12} /> {formatDate(ver.publishedAt)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Database size={12} /> {formatSize(ver.size)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Download size={12} /> {ver.downloadCount} 次
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-ghost p-2 text-slate-400 hover:text-red-600 hover:bg-red-50"
                onClick={() => handleDeleteVersion(ver.version)}
                title="删除此版本"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {compareMode && (
        <CompareModal
          pkg={pkg}
          versionA={compareVersionA}
          versionB={compareVersionB}
          setVersionA={setCompareVersionA}
          setVersionB={setCompareVersionB}
          result={compareResult}
          loading={compareLoading}
          error={compareError}
          onClose={closeCompare}
          onCompare={handleCompare}
          showFileDiff={showFileDiff}
          setShowFileDiff={setShowFileDiff}
        />
      )}
    </div>
  );
}

function InfoCard({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 rounded-lg bg-slate-50">
      <div className="flex items-center gap-2 text-slate-500 text-xs">
        <Icon size={14} />
        {label}
      </div>
      <div className="mt-1.5 font-semibold text-slate-800 truncate">{value}</div>
    </div>
  );
}

interface CompareModalProps {
  pkg: PackageInfo;
  versionA: string;
  versionB: string;
  setVersionA: (v: string) => void;
  setVersionB: (v: string) => void;
  result: CompareResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onCompare: () => void;
  showFileDiff: boolean;
  setShowFileDiff: (v: boolean) => void;
}

function CompareModal({
  pkg,
  versionA,
  versionB,
  setVersionA,
  setVersionB,
  result,
  loading,
  error,
  onClose,
  onCompare,
  showFileDiff,
  setShowFileDiff,
}: CompareModalProps) {
  const params = useParams<{ registry: RegistryType; name: string }>();
  const changedFields = useMemo(
    () => result?.metadataDiff.filter((f) => f.changed) ?? [],
    [result]
  );
  const unchangedFields = useMemo(
    () => result?.metadataDiff.filter((f) => !f.changed) ?? [],
    [result]
  );

  const fileStats = useMemo(() => {
    if (!result) return null;
    const added = result.files.diff.filter((f) => f.status === 'added').length;
    const removed = result.files.diff.filter((f) => f.status === 'removed').length;
    const modified = result.files.diff.filter((f) => f.status === 'modified').length;
    const unchanged = result.files.diff.filter((f) => f.status === 'unchanged').length;
    return { added, removed, modified, unchanged };
  }, [result]);

  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContentDiff, setFileContentDiff] = useState<FileContentDiff | null>(null);
  const [fileDiffLoading, setFileDiffLoading] = useState(false);
  const [fileDiffError, setFileDiffError] = useState<string | null>(null);

  const handleViewFileDiff = async (filePath: string) => {
    if (!params.registry || !params.name || !versionA || !versionB) return;
    setSelectedFile(filePath);
    setFileDiffLoading(true);
    setFileDiffError(null);
    setFileContentDiff(null);
    try {
      const diff = await api.diffFileContent(
        params.registry,
        decodeURIComponent(params.name),
        versionA,
        versionB,
        filePath
      );
      setFileContentDiff(diff);
    } catch (e: any) {
      setFileDiffError(e.message || '获取文件diff失败');
    } finally {
      setFileDiffLoading(false);
    }
  };

  const closeFileDiff = () => {
    setSelectedFile(null);
    setFileContentDiff(null);
    setFileDiffError(null);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <GitCompareArrows size={20} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-800">版本对比</h2>
              <p className="text-sm text-slate-500">{pkg.name}</p>
            </div>
          </div>
          <button
            className="btn btn-ghost p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">基础版本 (A)</label>
              <VersionSelect
                versions={pkg.versions.map((v) => v.version)}
                value={versionA}
                onChange={setVersionA}
                exclude={versionB}
              />
            </div>
            <div className="hidden md:flex pb-2.5">
              <GitCompareArrows className="text-slate-400" size={20} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">对比版本 (B)</label>
              <VersionSelect
                versions={pkg.versions.map((v) => v.version)}
                value={versionB}
                onChange={setVersionB}
                exclude={versionA}
              />
            </div>
            <div>
              <button
                className="btn btn-primary w-full md:w-auto"
                onClick={onCompare}
                disabled={loading || !versionA || !versionB || versionA === versionB}
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <GitCompareArrows size={16} />}
                {loading ? '对比中...' : '开始对比'}
              </button>
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              <AlertTriangle size={16} className="inline mr-2" />
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-6">
              <SizeDiffSection result={result} />

              <MetadataDiffSection
                changedFields={changedFields}
                unchangedFields={unchangedFields}
                versionA={versionA}
                versionB={versionB}
              />

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold text-slate-800">
                    文件变更
                    {fileStats && (
                      <span className="ml-3 text-sm font-normal text-slate-500">
                        共 {result.files.diff.length} 个文件
                        {fileStats.added > 0 && <span className="ml-2 text-emerald-600">+{fileStats.added} 新增</span>}
                        {fileStats.removed > 0 && <span className="ml-2 text-red-600">-{fileStats.removed} 删除</span>}
                        {fileStats.modified > 0 && <span className="ml-2 text-amber-600">~{fileStats.modified} 修改</span>}
                      </span>
                    )}
                  </h3>
                  <button
                    className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                    onClick={() => setShowFileDiff(!showFileDiff)}
                  >
                    {showFileDiff ? '收起' : '展开全部'}
                    <ChevronDown
                      size={16}
                      className={`inline ml-1 transition-transform ${showFileDiff ? 'rotate-180' : ''}`}
                    />
                  </button>
                </div>

                {fileStats && fileStats.added + fileStats.removed + fileStats.modified === 0 ? (
                  <div className="p-8 text-center bg-slate-50 rounded-lg">
                    <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
                    <p className="text-slate-600">两个版本的文件完全一致</p>
                  </div>
                ) : showFileDiff ? (
                  <FileDiffList diff={result.files.diff} onViewDiff={handleViewFileDiff} />
                ) : (
                  <FileDiffSummary diff={result.files.diff} onViewDiff={handleViewFileDiff} />
                )}

                {selectedFile && (
                  <ContentDiffModal
                    filePath={selectedFile}
                    versionA={versionA}
                    versionB={versionB}
                    diff={fileContentDiff}
                    loading={fileDiffLoading}
                    error={fileDiffError}
                    onClose={closeFileDiff}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VersionSelect({
  versions,
  value,
  onChange,
  exclude,
}: {
  versions: string[];
  value: string;
  onChange: (v: string) => void;
  exclude?: string;
}) {
  return (
    <select
      className="input w-full"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">选择版本</option>
      {versions.map((v) => (
        <option key={v} value={v} disabled={v === exclude}>
          {v}
          {v === exclude ? ' (已选为另一个版本)' : ''}
        </option>
      ))}
    </select>
  );
}

function SizeDiffSection({ result }: { result: CompareResult }) {
  const { sizeA, sizeB, sizeDelta, sizeDeltaPercent } = result.sizeDiff;
  const { countA, countB, countDelta } = result.files;

  const DeltaIcon = sizeDelta > 0 ? ArrowUpRight : sizeDelta < 0 ? ArrowDownRight : Minus;
  const deltaColor = sizeDelta > 0 ? 'text-red-600' : sizeDelta < 0 ? 'text-emerald-600' : 'text-slate-500';
  const deltaBg = sizeDelta > 0 ? 'bg-red-50 border-red-200' : sizeDelta < 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200';

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="p-4 rounded-lg bg-slate-50">
        <div className="text-xs text-slate-500 mb-1">版本 A 大小</div>
        <div className="font-semibold text-slate-800">{formatSize(sizeA)}</div>
        <div className="text-xs text-slate-400 mt-0.5">{countA} 个文件</div>
      </div>
      <div className="p-4 rounded-lg bg-slate-50">
        <div className="text-xs text-slate-500 mb-1">版本 B 大小</div>
        <div className="font-semibold text-slate-800">{formatSize(sizeB)}</div>
        <div className="text-xs text-slate-400 mt-0.5">{countB} 个文件</div>
      </div>
      <div className={`p-4 rounded-lg border ${deltaBg}`}>
        <div className="text-xs text-slate-500 mb-1">大小变化</div>
        <div className={`font-semibold flex items-center gap-1 ${deltaColor}`}>
          <DeltaIcon size={16} />
          {sizeDelta === 0 ? '0 B' : `${sizeDelta > 0 ? '+' : ''}${formatSize(sizeDelta)}`}
        </div>
        <div className={`text-xs mt-0.5 ${deltaColor}`}>
          {sizeDeltaPercent === 0 ? '0%' : `${sizeDeltaPercent > 0 ? '+' : ''}${sizeDeltaPercent.toFixed(2)}%`}
        </div>
      </div>
      <div className="p-4 rounded-lg bg-slate-50">
        <div className="text-xs text-slate-500 mb-1">文件数量变化</div>
        <div className={`font-semibold flex items-center gap-1 ${
          countDelta > 0 ? 'text-red-600' : countDelta < 0 ? 'text-emerald-600' : 'text-slate-800'
        }`}>
          {countDelta > 0 ? <ArrowUpRight size={16} /> : countDelta < 0 ? <ArrowDownRight size={16} /> : <Minus size={16} />}
          {countDelta === 0 ? '0' : `${countDelta > 0 ? '+' : ''}${countDelta}`}
        </div>
      </div>
    </div>
  );
}

function MetadataDiffSection({
  changedFields,
  unchangedFields,
  versionA,
  versionB,
}: {
  changedFields: CompareResult['metadataDiff'];
  unchangedFields: CompareResult['metadataDiff'];
  versionA: string;
  versionB: string;
}) {
  const [showUnchanged, setShowUnchanged] = useState(false);

  return (
    <div>
      <h3 className="text-base font-semibold text-slate-800 mb-4">
        元数据差异
        <span className="ml-3 text-sm font-normal text-slate-500">
          {changedFields.length > 0 ? (
            <span className="text-amber-600">{changedFields.length} 项变更</span>
          ) : (
            <span className="text-emerald-600">无变更</span>
          )}
        </span>
      </h3>

      {changedFields.length > 0 ? (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-[140px_1fr_1fr] bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
            <div className="p-3">字段</div>
            <div className="p-3 border-l border-slate-200">{versionA}</div>
            <div className="p-3 border-l border-slate-200">{versionB}</div>
          </div>
          {changedFields.map((field, i) => (
            <div
              key={i}
              className={`grid grid-cols-[140px_1fr_1fr] text-sm ${
                i !== changedFields.length - 1 ? 'border-b border-slate-100' : ''
              }`}
            >
              <div className="p-3 text-slate-600 font-medium">{field.field}</div>
              <div className="p-3 border-l border-slate-100 font-mono text-xs">
                <DiffValue value={field.valueA} variant="old" />
              </div>
              <div className="p-3 border-l border-slate-100 font-mono text-xs">
                <DiffValue value={field.valueB} variant="new" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          <CheckCircle2 size={16} className="inline mr-2" />
          两个版本的元数据完全一致
        </div>
      )}

      {unchangedFields.length > 0 && (
        <div className="mt-3">
          <button
            className="text-sm text-slate-500 hover:text-slate-700"
            onClick={() => setShowUnchanged(!showUnchanged)}
          >
            {showUnchanged ? '隐藏' : '显示'} {unchangedFields.length} 个未变更字段
            <ChevronDown
              size={14}
              className={`inline ml-1 transition-transform ${showUnchanged ? 'rotate-180' : ''}`}
            />
          </button>
          {showUnchanged && (
            <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-[140px_1fr_1fr] bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                <div className="p-3">字段</div>
                <div className="p-3 border-l border-slate-200">{versionA}</div>
                <div className="p-3 border-l border-slate-200">{versionB}</div>
              </div>
              {unchangedFields.map((field, i) => (
                <div
                  key={i}
                  className={`grid grid-cols-[140px_1fr_1fr] text-sm ${
                    i !== unchangedFields.length - 1 ? 'border-b border-slate-100' : ''
                  }`}
                >
                  <div className="p-3 text-slate-500">{field.field}</div>
                  <div className="p-3 border-l border-slate-100 font-mono text-xs text-slate-600">
                    <DiffValue value={field.valueA} variant="same" />
                  </div>
                  <div className="p-3 border-l border-slate-100 font-mono text-xs text-slate-600">
                    <DiffValue value={field.valueB} variant="same" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DiffValue({ value, variant }: { value: MetadataDiffValue; variant: 'old' | 'new' | 'same' }) {
  if (value === undefined || value === null) {
    return <span className="text-slate-400 italic">—</span>;
  }

  const isObj = typeof value === 'object' && !Array.isArray(value);
  const isArr = Array.isArray(value);

  const textClass =
    variant === 'old' ? 'bg-red-50 text-red-700 px-1.5 py-0.5 rounded' :
    variant === 'new' ? 'bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded' :
    '';

  if (isObj) {
    const entries = Object.entries(value as Record<string, string>);
    return (
      <div className="space-y-0.5">
        {entries.map(([k, v]) => (
          <div key={k}>
            <span className="text-slate-500">{k}:</span>{' '}
            <span className={textClass}>{v}</span>
          </div>
        ))}
        {entries.length === 0 && <span className="text-slate-400 italic">—</span>}
      </div>
    );
  }

  if (isArr) {
    return (
      <div className="flex flex-wrap gap-1">
        {(value as string[]).map((v, i) => (
          <span key={i} className={textClass}>{v}</span>
        ))}
      </div>
    );
  }

  return <span className={textClass}>{String(value)}</span>;
}

function FileDiffSummary({ diff, onViewDiff }: { diff: FileDiffEntry[]; onViewDiff: (path: string) => void }) {
  const added = diff.filter((f) => f.status === 'added');
  const removed = diff.filter((f) => f.status === 'removed');
  const modified = diff.filter((f) => f.status === 'modified');

  return (
    <div className="space-y-3">
      {added.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 mb-2">
            <FilePlus size={14} /> 新增文件 ({added.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {added.slice(0, 20).map((f) => (
              <button
                key={f.path}
                onClick={() => onViewDiff(f.path)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded font-mono hover:bg-emerald-100 transition-colors"
              >
                {f.path}
                <FileCode size={10} />
              </button>
            ))}
            {added.length > 20 && (
              <span className="text-xs text-slate-500 px-2 py-1">等 {added.length} 个文件</span>
            )}
          </div>
        </div>
      )}
      {removed.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-2">
            <FileMinus size={14} /> 删除文件 ({removed.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {removed.slice(0, 20).map((f) => (
              <button
                key={f.path}
                onClick={() => onViewDiff(f.path)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-red-50 text-red-700 rounded font-mono line-through hover:bg-red-100 transition-colors"
              >
                {f.path}
                <FileCode size={10} />
              </button>
            ))}
            {removed.length > 20 && (
              <span className="text-xs text-slate-500 px-2 py-1">等 {removed.length} 个文件</span>
            )}
          </div>
        </div>
      )}
      {modified.length > 0 && (
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-2">
            <FileEdit size={14} /> 修改文件 ({modified.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modified.slice(0, 20).map((f) => (
              <button
                key={f.path}
                onClick={() => onViewDiff(f.path)}
                className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded font-mono hover:bg-amber-100 transition-colors"
              >
                {f.path}
                {f.sizeDiff !== undefined && f.sizeDiff !== 0 && (
                  <span className={f.sizeDiff > 0 ? 'text-red-600' : 'text-emerald-600'}>
                    ({f.sizeDiff > 0 ? '+' : ''}{formatSize(f.sizeDiff)})
                  </span>
                )}
                <FileCode size={10} />
              </button>
            ))}
            {modified.length > 20 && (
              <span className="text-xs text-slate-500 px-2 py-1">等 {modified.length} 个文件</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function FileDiffList({ diff, onViewDiff }: { diff: FileDiffEntry[]; onViewDiff: (path: string) => void }) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden">
      <div className="grid grid-cols-[1fr_120px_120px_120px_40px] bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
        <div className="p-3">文件路径</div>
        <div className="p-3 text-right border-l border-slate-200">大小 A</div>
        <div className="p-3 text-right border-l border-slate-200">大小 B</div>
        <div className="p-3 text-right border-l border-slate-200">变化</div>
        <div className="p-3 border-l border-slate-200"></div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {diff.map((f, i) => {
          const Icon =
            f.status === 'added' ? FilePlus :
            f.status === 'removed' ? FileMinus :
            f.status === 'modified' ? FileEdit :
            File;
          const statusColor =
            f.status === 'added' ? 'text-emerald-600 bg-emerald-50' :
            f.status === 'removed' ? 'text-red-600 bg-red-50' :
            f.status === 'modified' ? 'text-amber-600 bg-amber-50' :
            'text-slate-400';
          const diffColor =
            (f.sizeDiff ?? 0) > 0 ? 'text-red-600' :
            (f.sizeDiff ?? 0) < 0 ? 'text-emerald-600' :
            'text-slate-400';

          return (
            <div
              key={i}
              className={`grid grid-cols-[1fr_120px_120px_120px_40px] text-sm ${
                i !== diff.length - 1 ? 'border-b border-slate-100' : ''
              }`}
            >
              <div className={`p-3 flex items-center gap-2 font-mono text-xs ${
                f.status === 'removed' ? 'line-through text-slate-500' : ''
              }`}>
                <Icon size={14} className={statusColor.split(' ')[0]} />
                <span className={`px-1.5 py-0.5 rounded ${statusColor.split(' ')[1] || ''}`}>
                  {f.status === 'added' ? '+' : f.status === 'removed' ? '-' : f.status === 'modified' ? '~' : ''}
                </span>
                <span className="truncate">{f.path}</span>
              </div>
              <div className="p-3 text-right text-slate-500 font-mono text-xs border-l border-slate-100">
                {f.sizeA !== undefined ? formatSize(f.sizeA) : '—'}
              </div>
              <div className="p-3 text-right text-slate-500 font-mono text-xs border-l border-slate-100">
                {f.sizeB !== undefined ? formatSize(f.sizeB) : '—'}
              </div>
              <div className={`p-3 text-right font-mono text-xs border-l border-slate-100 ${diffColor}`}>
                {f.sizeDiff === undefined || f.sizeDiff === 0 ? '—' :
                  `${f.sizeDiff > 0 ? '+' : ''}${formatSize(f.sizeDiff)}`}
              </div>
              <div className="p-3 text-center border-l border-slate-100">
                {f.status !== 'unchanged' && (
                  <button
                    onClick={() => onViewDiff(f.path)}
                    className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 p-1 rounded transition-colors"
                    title="查看内容diff"
                  >
                    <ExternalLink size={14} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ContentDiffModalProps {
  filePath: string;
  versionA: string;
  versionB: string;
  diff: FileContentDiff | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

function ContentDiffModal({
  filePath,
  versionA,
  versionB,
  diff,
  loading,
  error,
  onClose,
}: ContentDiffModalProps) {
  const [showAllLines, setShowAllLines] = useState(false);

  const visibleLines = useMemo(() => {
    if (!diff?.lines) return [];
    if (showAllLines) return diff.lines;

    const result: (DiffLine | { type: 'gap'; count: number })[] = [];
    let unchangedCount = 0;

    for (let i = 0; i < diff.lines.length; i++) {
      const line = diff.lines[i];
      if (line.type === 'unchanged') {
        unchangedCount++;
      } else {
        if (unchangedCount > 0) {
          if (unchangedCount > 6) {
            const contextBefore = Math.min(3, unchangedCount);
            for (let j = i - unchangedCount; j < i - unchangedCount + contextBefore; j++) {
              result.push(diff.lines[j]);
            }
            result.push({ type: 'gap', count: unchangedCount - 6 });
            const contextAfter = Math.min(3, unchangedCount - contextBefore);
            for (let j = i - contextAfter; j < i; j++) {
              result.push(diff.lines[j]);
            }
          } else {
            for (let j = i - unchangedCount; j < i; j++) {
              result.push(diff.lines[j]);
            }
          }
          unchangedCount = 0;
        }
        result.push(line);
      }
    }

    if (unchangedCount > 0) {
      if (unchangedCount > 3) {
        for (let j = diff.lines.length - unchangedCount; j < diff.lines.length - unchangedCount + 3; j++) {
          result.push(diff.lines[j]);
        }
        result.push({ type: 'gap', count: unchangedCount - 3 });
      } else {
        for (let j = diff.lines.length - unchangedCount; j < diff.lines.length; j++) {
          result.push(diff.lines[j]);
        }
      }
    }

    return result;
  }, [diff?.lines, showAllLines]);

  return (
    <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 sticky top-0 bg-white rounded-t-2xl z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <FileCode size={20} />
            </div>
            <div className="max-w-xl">
              <h3 className="font-semibold text-slate-800 truncate font-mono text-sm">{filePath}</h3>
              <p className="text-xs text-slate-500">
                {versionA} → {versionB}
              </p>
            </div>
          </div>
          <button
            className="btn btn-ghost p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
              <p className="text-red-600">{error}</p>
            </div>
          ) : !diff ? (
            <div className="p-8 text-center text-slate-500">
              暂无数据
            </div>
          ) : diff.status === 'binary' ? (
            <div className="p-8 text-center">
              <File size={48} className="mx-auto text-slate-400 mb-3" />
              <p className="text-slate-600 font-medium">二进制文件</p>
              <p className="text-slate-500 text-sm mt-1">无法展示二进制文件的内容差异</p>
            </div>
          ) : diff.status === 'error' ? (
            <div className="p-8 text-center">
              <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
              <p className="text-red-600">{diff.error || '获取文件内容失败'}</p>
            </div>
          ) : diff.status === 'unchanged' ? (
            <div className="p-8 text-center">
              <CheckCircle2 size={32} className="mx-auto text-emerald-500 mb-2" />
              <p className="text-slate-600">文件内容未发生变化</p>
            </div>
          ) : (
            <div className="p-4">
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-red-100 border border-red-200"></span> 删除
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200"></span> 新增
                  </span>
                </div>
                {diff.lines && diff.lines.length > 50 && (
                  <button
                    onClick={() => setShowAllLines(!showAllLines)}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    {showAllLines ? '折叠未变更' : '展开全部'}
                  </button>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-[60px_60px_1fr] bg-slate-50 text-xs font-medium text-slate-500 border-b border-slate-200">
                  <div className="p-2 text-right border-r border-slate-200">{versionA}</div>
                  <div className="p-2 text-right border-r border-slate-200">{versionB}</div>
                  <div className="p-2">内容</div>
                </div>
                <div className="font-mono text-xs">
                  {visibleLines.map((line, i) => {
                    if ('type' in line && line.type === 'gap') {
                      return (
                        <div key={i} className="grid grid-cols-[60px_60px_1fr] bg-slate-50 text-slate-400 text-center py-1 border-b border-slate-100">
                          <div className="border-r border-slate-200">...</div>
                          <div className="border-r border-slate-200">...</div>
                          <div className="text-left pl-3">{line.count} 行未变更</div>
                        </div>
                      );
                    }
                    const dl = line as DiffLine;
                    const bgClass =
                      dl.type === 'added' ? 'bg-emerald-50' :
                      dl.type === 'removed' ? 'bg-red-50' :
                      'bg-white';
                    const sign = dl.type === 'added' ? '+' : dl.type === 'removed' ? '-' : ' ';
                    const textColor =
                      dl.type === 'added' ? 'text-emerald-700' :
                      dl.type === 'removed' ? 'text-red-700' :
                      'text-slate-600';

                    return (
                      <div
                        key={i}
                        className={`grid grid-cols-[60px_60px_1fr] ${bgClass} ${i !== visibleLines.length - 1 ? 'border-b border-slate-100' : ''}`}
                      >
                        <div className="p-1.5 text-right text-slate-400 border-r border-slate-200 select-none">
                          {dl.lineA ?? ''}
                        </div>
                        <div className="p-1.5 text-right text-slate-400 border-r border-slate-200 select-none">
                          {dl.lineB ?? ''}
                        </div>
                        <div className={`p-1.5 whitespace-pre ${textColor}`}>
                          <span className="w-4 inline-block select-none">{sign}</span>
                          {dl.content}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
