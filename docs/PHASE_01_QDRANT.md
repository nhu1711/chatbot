# PHASE 01 — Chuyển RAG sang Qdrant

## Thay đổi và lý do

Hệ thống không còn ghi embedding Gemini vào `data/embeddings.json` hoặc nạp tất cả vector vào RAM. Qdrant lưu vector, thực hiện tìm kiếm cosine Top-K và trả về payload của chunk. Cách này tránh tăng bộ nhớ ứng dụng khi dữ liệu lớn hơn, đồng thời việc lập chỉ mục có thể chạy lại an toàn.

## Tệp đã tạo hoặc sửa

- `server/src/rag/qdrant.js`: lớp truy cập Qdrant, tạo/kiểm tra collection, upsert, truy vấn và báo lỗi kết nối.
- `server/src/rag/indexer.js`: tạo embedding rồi upsert vào Qdrant.
- `server/src/rag/retriever.js`: embedding câu hỏi rồi query Qdrant; không còn cosine thủ công.
- `server/src/server.js`: health kiểm tra số điểm Qdrant; API chat giữ nguyên hợp đồng.
- `server/src/config.js`, `server/package.json`, `server/package-lock.json`: cấu hình và dependency Qdrant.
- `server/test/qdrant.test.js`: kiểm thử mock.

## Kiến trúc cũ và mới

Trước đây: Markdown → chunk → Gemini embedding → `embeddings.json` → nạp RAM → cosine thủ công → Gemini generate.

Hiện tại: Markdown → chunk → Gemini embedding → Qdrant (`hcmc_travel_chunks`) → Qdrant cosine Top-K → Gemini generate.

Prompt grounded, câu trả lời fallback và dạng `answer`/`sources` của API không thay đổi. Ngưỡng `SIMILARITY_THRESHOLD` vẫn được kiểm tra trong `/api/chat` dựa trên điểm Qdrant.

## Luồng lập chỉ mục

`npm run index` đọc các tệp Markdown hiện có bằng logic chunk cũ. Mỗi section được embedding bằng Gemini. Dimension của embedding đầu tiên được dùng để tạo collection nếu collection chưa có; collection hiện có phải cùng dimension, nếu khác hệ thống dừng với lỗi chẩn đoán rõ ràng và không tự xóa/tạo lại. Mỗi chunk dùng UUID xác định từ `chunk.id`, nên index lại cùng tài liệu sẽ cập nhật đúng point thay vì tạo bản sao.

Payload gồm `chunkId`, `source`, `title`, `content`, `chunkIndex`. Không log API key, nội dung đầy đủ hay vector embedding.

## Luồng chat

`POST /api/chat` nhận `{ "message": "..." }`, tạo embedding cho câu hỏi, lấy Top-K từ Qdrant, áp dụng ngưỡng tương đồng cũ, rồi chỉ gửi các chunk đạt điều kiện vào Gemini. `sources` vẫn có `title`, `source`, `score` để React dùng như trước.

## Cấu hình Qdrant

Trong `server/.env`:

```env
QDRANT_URL=http://127.0.0.1:6333
QDRANT_COLLECTION=hcmc_travel_chunks
```

Không dùng hoặc sửa collection `rag_chunks` của dự án khác. Mặc định Qdrant dùng `hcmc_travel_chunks` và khoảng cách `Cosine`.

## Khởi động Qdrant bằng Docker

```bash
docker run --name hcmc-qdrant -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

Sau lần đầu, dùng `docker start hcmc-qdrant`. Không chạy lệnh xóa container hoặc volume nếu muốn giữ index.

## Lập chỉ mục và chạy ứng dụng

Tại thư mục gốc dự án:

```bash
npm run index
npm run dev
```

Hoặc chạy riêng backend: `npm --prefix server run dev`. Health endpoint vẫn là `GET /api/health`; nếu Qdrant chưa sẵn sàng server vẫn khởi động nhưng ghi cảnh báo và `indexedChunks` là 0.

## Kết quả kiểm thử

`npm --prefix server test` chạy test mock, không gọi Gemini thật. Các trường hợp: tạo collection thiếu, tái sử dụng collection, sai dimension, point ID idempotent/payload, Top-K mapping và lỗi kết nối Qdrant. Build frontend được chạy riêng bằng `npm --prefix client run build`.

## Giới hạn còn lại

- Cần Docker/Qdrant đang chạy và `GEMINI_API_KEY` hợp lệ để index hoặc chat thật.
- Chưa có upload tài liệu, PDF/DOCX/TXT, thay đổi giao diện hoặc `systemInstruction`; các nội dung này thuộc phase sau.
- Test API end-to-end với Qdrant/Gemini thật cần thực hiện ở môi trường có dịch vụ và khóa hợp lệ.

## Câu hỏi bảo vệ thường gặp

**Vì sao dùng Qdrant thay JSON?** JSON phù hợp demo nhỏ, nhưng phải nạp mọi vector vào bộ nhớ và tự tính độ giống. Qdrant chuyên cho vector search, nên tìm Top-K hiệu quả hơn và dữ liệu được lưu bền vững.

**Làm sao tránh trùng dữ liệu khi index lại?** ID point được sinh xác định từ ID chunk, ví dụ cùng `food_0` luôn thành cùng UUID. Upsert sẽ cập nhật point đó, không thêm bản sao.

**Nếu đổi model embedding thì sao?** Dimension có thể thay đổi. Ứng dụng so sánh dimension Gemini trả về với collection hiện có và báo lỗi; không tự xóa collection để tránh mất dữ liệu ngoài ý muốn.

**Tại sao vẫn cần similarity threshold?** Top-K luôn trả về kết quả gần nhất, kể cả khi câu hỏi ngoài phạm vi. Ngưỡng chặn các kết quả không đủ liên quan trước khi gọi Gemini, giúp câu trả lời có grounding tốt hơn.

**Frontend có cần sửa không?** Không. API `POST /api/chat` vẫn trả `answer` và `sources` cùng định dạng; chỉ phần lưu trữ và truy xuất ở backend đổi sang Qdrant.
