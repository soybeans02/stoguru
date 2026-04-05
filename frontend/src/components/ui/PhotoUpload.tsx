import { useRef, useState } from 'react';
import { uploadPhoto, deletePhoto } from '../../utils/api';

interface Props {
  photos: string[];
  onChange: (photos: string[]) => void;
  maxPhotos?: number;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function PhotoUpload({ photos, onChange, maxPhotos = 5 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // リセット
    setError('');
    if (fileRef.current) fileRef.current.value = '';

    // バリデーション
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('JPEG、PNG、WebP形式の画像のみアップロードできます');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('ファイルサイズは5MB以下にしてください');
      return;
    }
    if (photos.length >= maxPhotos) {
      setError(`写真は${maxPhotos}枚までです`);
      return;
    }

    setUploading(true);
    setProgress('アップロード中...');
    try {
      const publicUrl = await uploadPhoto(file);
      onChange([...photos, publicUrl]);
      setProgress('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
      setProgress('');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (index: number) => {
    const url = photos[index];
    // S3キーをURLから抽出
    const match = url.match(/\.amazonaws\.com\/(.+)$/);
    if (match) {
      try {
        await deletePhoto(match[1]);
      } catch {
        // S3削除失敗しても配列からは削除する
      }
    }
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {photos.map((url, i) => (
          <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={() => handleDelete(i)}
              className="absolute top-1 right-1 w-6 h-6 flex items-center justify-center rounded-full bg-black/50 text-white text-xs hover:bg-black/70 transition-colors"
            >
              x
            </button>
          </div>
        ))}

        {photos.length < maxPhotos && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <span className="text-xs text-gray-500">{progress}</span>
            ) : (
              <span className="text-2xl">+</span>
            )}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
