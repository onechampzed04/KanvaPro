from huggingface_hub import HfApi, snapshot_download
import os

api = HfApi()

search_term = "sticker"
datasets = list(api.list_datasets(search=search_term))

datasets_subset = datasets[:34] 

base_path = "E:/DoAn2026/Stickers_Data"

if not os.path.exists(base_path):
    os.makedirs(base_path)

print(f"Tìm thấy tổng cộng {len(datasets)} datasets. Nhưng chỉ tải {len(datasets_subset)} datasets đầu tiên.")

for i, ds in enumerate(datasets_subset):
    repo_id = ds.id
    folder_name = repo_id.replace("/", "_")
    local_dir = os.path.join(base_path, folder_name)
    
    print(f"[{i+1}/{len(datasets_subset)}] Đang tải: {repo_id}")
    
    try:
        snapshot_download(
            repo_id=repo_id,
            repo_type="dataset",
            local_dir=local_dir,
            ignore_patterns=[".git*", "README.md", ".gitattributes"]
        )
    except Exception as e:
        print(f"Lỗi khi tải {repo_id}: {e}")

print("--- HOÀN TẤT TẢI XUỐNG 34 FILES ---")