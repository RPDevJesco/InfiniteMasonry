window.MasonryLayout = class MasonryLayout {
    constructor(options = {}) {
        this.virtualizeBuffer = options.virtualizeBuffer || 2000; // Don't forget to add this line because I made whoopsies and forgot to include it in the index definition with testing. SO i'm being lazy and keeping this here instead of updating the script in index.html
        this.container = options.container || document.querySelector('.masonry-container');
        this.baseUnit = options.baseUnit || 200; // Base unit for grid calculations
        this.gap = options.gap || 10;
        this.pageSize = options.pageSize || 24;
        this.modalInitialized = false;

        // Pattern definitions (relative to base unit)
        this.patterns = [
            { width: 2, height: 1 },    // Horizontal rectangle
            { width: 1, height: 2 },    // Vertical rectangle
            { width: 2, height: 2 },    // Large square
            { width: 1, height: 1 },    // Small square
        ];

        // Internal state. Need to track these.
        this.items = [];
        this.currentPage = 0;
        this.isLoading = false;
        this.hasMore = true;

        // Bind methods to bind scrolling and resizing to it.
        this.onScroll = this.onScroll.bind(this);
        this.onResize = this.debounce(this.onResize.bind(this), 150);

        // Initialize the application moron!
        this.init();
    }

    init() {
        this.container.style.position = 'relative';
        this.container.style.width = '100%';
        this.container.style.minHeight = '100vh';
        window.addEventListener('scroll', this.onScroll, { passive: true });
        window.addEventListener('resize', this.onResize);
        this.loadNextPage();
    }

    async fetchItems(page, pageSize) {
        const items = [];

        for (let i = 0; i < pageSize; i++) {
            const pattern = this.patterns[i % this.patterns.length];
            const width = Math.round(pattern.width * this.baseUnit);
            const height = Math.round(pattern.height * this.baseUnit);
            const imageIndex = page * pageSize + i;

            // Check if image exists before adding it to items. Should probably update it so that it checks all image formats.
            try {
                const response = await fetch(`/images/${imageIndex + 1}.png`, { method: 'HEAD' });
                if (response.ok) {
                    items.push({
                        id: `${page}-${i}`,
                        width,
                        height,
                        pattern,
                        src: `/images/${imageIndex + 1}.png`
                    });
                } else {
                    console.log(`Image ${imageIndex + 1}.png does not exist, skipping`);
                }
            } catch (error) {
                console.log(`Error checking image ${imageIndex + 1}.png, skipping:`, error);
            }
        }

        return items;
    }

    renderItem(item, position) {
        console.log('Rendering item:', { item, position });
        let element = document.getElementById(`masonry-item-${item.id}`);

        if (!element) {
            console.log('Creating new element for item:', item.id);
            element = document.createElement('div');
            element.id = `masonry-item-${item.id}`;
            element.className = 'masonry-item';
            element.addEventListener('click', () => this.openModal(item.src));

            const img = new Image();
            const placeholder = document.createElement('div');
            placeholder.className = 'masonry-item-placeholder';
            element.appendChild(placeholder);

            img.onload = () => {
                console.log('Image loaded:', item.src);
                placeholder.remove();
                element.appendChild(img);
                img.style.opacity = 1;
            };

            img.onerror = () => {
                console.log('Image failed to load:', item.src);
                // Instead of showing error placeholder, remove the entire item (removing this shows placeholder images which I don't want)
                element.remove();
            };

            img.src = item.src;
            img.alt = `Item ${item.id}`;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            img.style.opacity = 0;
            img.style.transition = 'opacity 0.3s ease';

            this.container.appendChild(element);
        }

        // Add visible borders and make sure positioning is applied because in testing when things don't appear, we want to make sure that the layout is working.
        element.style.position = 'absolute';
        element.style.left = `${position.left}px`;
        element.style.top = `${position.top}px`;
        element.style.width = `${position.width}px`;
        element.style.height = `${position.height}px`;
        element.style.border = '2px solid #ccc';
    }

    calculateLayout() {
        const containerWidth = this.container.clientWidth;
        const positions = new Map();
        const grid = [];
        const cols = Math.floor(containerWidth / (this.baseUnit + this.gap));

        let currentX = 0;
        let currentY = 0;

        this.items.forEach(item => {
            const pattern = item.pattern;
            let placed = false;

            while (!placed) {
                if (currentX + pattern.width <= cols) {
                    let fits = true;
                    for (let y = currentY; y < currentY + pattern.height; y++) {
                        for (let x = currentX; x < currentX + pattern.width; x++) {
                            if (grid[y] && grid[y][x]) {
                                fits = false;
                                break;
                            }
                        }
                        if (!fits) break;
                    }

                    if (fits) {
                        for (let y = currentY; y < currentY + pattern.height; y++) {
                            grid[y] = grid[y] || [];
                            for (let x = currentX; x < currentX + pattern.width; x++) {
                                grid[y][x] = item.id;
                            }
                        }

                        positions.set(item.id, {
                            left: currentX * (this.baseUnit + this.gap),
                            top: currentY * (this.baseUnit + this.gap),
                            width: pattern.width * this.baseUnit + (pattern.width - 1) * this.gap,
                            height: pattern.height * this.baseUnit + (pattern.height - 1) * this.gap
                        });
                        placed = true;
                    }
                }

                if (!placed) {
                    currentX++;
                    if (currentX >= cols) {
                        currentX = 0;
                        currentY++;
                    }
                }
            }
        });

        const maxY = Math.max(...this.items.map(item => {
            const pos = positions.get(item.id);
            return pos ? pos.top + pos.height : 0;
        }));
        this.container.style.height = (maxY + this.gap) + 'px';

        return positions;
    }

    layoutItems() {
        console.log('Starting layout calculation...');
        const positions = this.calculateLayout();
        console.log('Positions calculated:', positions);

        const viewportTop = window.scrollY - this.virtualizeBuffer;
        const viewportBottom = window.scrollY + window.innerHeight + this.virtualizeBuffer;
        console.log('Viewport range:', { viewportTop, viewportBottom });

        this.items.forEach(item => {
            const position = positions.get(item.id);
            if (!position) {
                console.warn(`No position found for item ${item.id}`);
                return;
            }

            const shouldRender = position.top < viewportBottom &&
                position.top + position.height > viewportTop;
            console.log(`Item ${item.id}: shouldRender=${shouldRender}`, {
                position,
                inView: {
                    top: position.top < viewportBottom,
                    bottom: position.top + position.height > viewportTop
                }
            });

            if (shouldRender) {
                this.renderItem(item, position);
            } else {
                const element = document.getElementById(`masonry-item-${item.id}`);
                if (element) {
                    console.log(`Removing item ${item.id} from DOM`);
                    element.remove();
                }
            }
        });
    }

    openModal(imageSrc) {
        const modal = document.getElementById('imageModal');
        const modalImg = document.getElementById('modalImage');

        modalImg.src = imageSrc;
        modal.classList.add('show');

        document.body.style.overflow = 'hidden';

        if (!this.modalInitialized) {
            this.initializeModal();
        }
    }

    initializeModal() {
        const modal = document.getElementById('imageModal');
        const closeBtn = modal.querySelector('.modal-close');

        closeBtn.addEventListener('click', () => this.closeModal());

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });

        this.modalInitialized = true;
    }

    closeModal() {
        const modal = document.getElementById('imageModal');
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    async loadNextPage() {
        console.log('loadNextPage called', {
            isLoading: this.isLoading,
            hasMore: this.hasMore,
            currentPage: this.currentPage,
            currentItemCount: this.items.length,
            pageSize: this.pageSize
        });

        if (this.isLoading || !this.hasMore) {
            console.log('Skipping load because:', { isLoading: this.isLoading, hasMore: this.hasMore });
            return;
        }

        this.isLoading = true;
        try {
            const newItems = await this.fetchItems(this.currentPage, this.pageSize);
            console.log('Fetched new items:', {
                count: newItems.length,
                expected: this.pageSize,
                items: newItems
            });

            this.currentPage++;
            this.items = [...this.items, ...newItems];
            console.log('Total items after update:', this.items.length);

            if (newItems.length < this.pageSize) {
                console.log('Setting hasMore to false - received less items than requested');
                this.hasMore = false;
            }

            this.layoutItems();
        } catch (error) {
            console.error('Error loading items:', error);
        } finally {
            this.isLoading = false;
        }
    }

    onScroll() {
        const scrollBottom = window.scrollY + window.innerHeight;
        const containerBottom = this.container.offsetTop + this.container.offsetHeight;
        const remainingScroll = containerBottom - scrollBottom;

        console.log('Scroll check:', {
            scrollBottom,
            containerBottom,
            remainingScroll,
            shouldLoadMore: remainingScroll < 1000
        });

        if (remainingScroll < 1000) {
            this.loadNextPage();
        }
    }

    onResize() {
        this.layoutItems();
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    destroy() {
        window.removeEventListener('scroll', this.onScroll);
        window.removeEventListener('resize', this.onResize);
        this.container.innerHTML = '';
    }
};